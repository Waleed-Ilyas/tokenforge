// On-chain scenarios: the transaction builders run against the real SPL Token, Token-2022 and Associated Token
// programs inside LiteSVM, an in-process Solana VM (no network, no faucet).
//
// This file is executed as its own Node process, one scenario per process, by tests/onchain.test.ts:
//   node --experimental-strip-types tests/support/scenarios.ts <scenario>
// It prints `PASS <scenario>` only after every assertion has held; a failed assertion throws first, so no marker.
//
// Why a child process and not plain vitest tests: LiteSVM's native code aborts with std::bad_alloc when the process
// tears down (and, if several VMs are used in one process, around the third transaction). This was reproduced on
// Linux CI with litesvm 0.5.0 and 0.8.0. The abort happens after the assertions ran, so the test judges the PASS
// marker, not the exit code. Other limits: LiteSVM has no Windows binary, and the deployed Metaplex Token Metadata
// program aborts the VM when executed, so that instruction is removed before sending and asserted structurally.
import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import { Keypair, LAMPORTS_PER_SOL, Transaction, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getExtensionData,
  getMetadataPointerState,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import { unpack } from "@solana/spl-token-metadata";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, metadataPda, mintRent, programFor, type CreatePlan } from "../../lib/tx.ts";
import type { Standard } from "../../lib/validate.ts";

const lite = await import("litesvm");

function harness() {
  const svm = new lite.LiteSVM();
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

  const send = (ixs: TransactionInstruction[], signers: Keypair[] = []) => {
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.add(...ixs);
    tx.sign(payer, ...signers);
    return svm.sendTransaction(tx);
  };
  const failed = (r: ReturnType<typeof send>) => r instanceof lite.FailedTransactionMetadata;
  const expectOk = (r: ReturnType<typeof send>) => assert.ok(!failed(r), `transaction failed: ${String(r)}`);
  const account = (pk: PublicKey) => {
    const a = svm.getAccount(pk);
    assert.ok(a, `account ${pk.toBase58()} is missing`);
    return { data: Buffer.from(a.data), owner: a.owner, lamports: Number(a.lamports), executable: a.executable };
  };

  /** One transaction. Returns the mint and the full instruction list (including the Metaplex one, which is not sent). */
  const createToken = async (standard: Standard, over: Partial<CreatePlan> = {}) => {
    const mint = Keypair.generate();
    const base = { name: "Forge Coin", symbol: "FRG", uri: "https://tokenforge.example/api/meta?n=Forge+Coin&s=FRG" };
    const rentLamports = await mintRent(async (space) => Number(svm.minimumBalanceForRentExemption(BigInt(space))), {
      standard,
      ...base,
      mint: mint.publicKey,
    });
    const plan: CreatePlan = {
      standard,
      payer: payer.publicKey,
      mint,
      ...base,
      decimals: 6,
      supply: 1_000_000_000n,
      fixedSupply: false,
      rentLamports,
      ...over,
    };
    const ixs = buildCreateTokenIxs(plan);
    expectOk(
      send(
        ixs.filter((ix) => !ix.programId.equals(METADATA_PROGRAM_ID)),
        [mint],
      ),
    );
    return { mint, ixs };
  };
  return { payer, send, failed, expectOk, account, createToken };
}

const other = () => Keypair.generate().publicKey;

// Every scenario sends at most two transactions.
export const SCENARIOS: Record<string, () => Promise<void>> = {
  "spl-create": async () => {
    const h = harness();
    const { mint, ixs } = await h.createToken("spl");
    const m = unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_PROGRAM_ID);
    assert.equal(m.decimals, 6);
    assert.equal(m.supply, 1_000_000_000n);
    assert.ok(m.mintAuthority?.equals(h.payer.publicKey));
    assert.equal(m.freezeAuthority, null);
    const ata = getAssociatedTokenAddressSync(mint.publicKey, h.payer.publicKey, false, TOKEN_PROGRAM_ID);
    assert.equal(unpackAccount(ata, h.account(ata), TOKEN_PROGRAM_ID).amount, 1_000_000_000n);
    const meta = ixs.find((ix) => ix.programId.equals(METADATA_PROGRAM_ID));
    assert.ok(meta, "the Metaplex instruction is part of the plan");
    assert.equal(meta.data[0], 33); // CreateMetadataAccountV3
    assert.ok(meta.keys[0].pubkey.equals(metadataPda(mint.publicKey)));
    assert.ok(meta.keys[1].pubkey.equals(mint.publicKey));
    assert.ok(meta.data.includes(Buffer.from("Forge Coin")));
    assert.ok(meta.data.includes(Buffer.from("FRG")));
  },

  "token2022-create": async () => {
    const h = harness();
    const { mint } = await h.createToken("token2022", { decimals: 9, supply: 5_000_000_000n });
    const m = unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_2022_PROGRAM_ID);
    assert.equal(m.decimals, 9);
    assert.equal(m.supply, 5_000_000_000n);
    assert.ok(getMetadataPointerState(m)?.metadataAddress?.equals(mint.publicKey));
    const raw = getExtensionData(ExtensionType.TokenMetadata, m.tlvData);
    assert.ok(raw, "token-metadata extension is present");
    const meta = unpack(raw);
    assert.equal(meta.name, "Forge Coin");
    assert.equal(meta.symbol, "FRG");
    assert.ok(meta.uri.includes("/api/meta"));
  },

  "fixed-supply": async () => {
    const h = harness();
    const { mint } = await h.createToken("spl", { fixedSupply: true });
    assert.equal(unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_PROGRAM_ID).mintAuthority, null);
    assert.ok(
      h.failed(h.send(buildMintIxs({ standard: "spl", mint: mint.publicKey, authority: h.payer.publicKey, amount: 1n }))),
      "minting after revoke must fail",
    );
  },

  "mint-more-spl": () => mintMore("spl"),
  "mint-more-token2022": () => mintMore("token2022"),
  "transfer-spl": () => transfer("spl"),
  "transfer-token2022": () => transfer("token2022"),

  "transfer-over-balance": async () => {
    const h = harness();
    const { mint } = await h.createToken("spl");
    assert.ok(
      h.failed(h.send(buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: h.payer.publicKey, to: other(), amount: 2_000_000_000n, decimals: 6 }))),
    );
  },

  "transfer-wrong-decimals": async () => {
    const h = harness();
    const { mint } = await h.createToken("spl");
    assert.ok(h.failed(h.send(buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: h.payer.publicKey, to: other(), amount: 1n, decimals: 5 }))));
  },
};

async function mintMore(standard: Standard) {
  const h = harness();
  const { mint } = await h.createToken(standard);
  h.expectOk(h.send(buildMintIxs({ standard, mint: mint.publicKey, authority: h.payer.publicKey, amount: 500n })));
  const m = unpackMint(mint.publicKey, h.account(mint.publicKey), programFor(standard));
  assert.equal(m.supply, 1_000_000_500n);
  assert.ok(m.mintAuthority?.equals(h.payer.publicKey));
}

async function transfer(standard: Standard) {
  const h = harness();
  const { mint } = await h.createToken(standard);
  const to = other();
  h.expectOk(h.send(buildTransferIxs({ standard, mint: mint.publicKey, from: h.payer.publicKey, to, amount: 250_000_000n, decimals: 6 })));
  const programId = programFor(standard);
  const dest = getAssociatedTokenAddressSync(mint.publicKey, to, true, programId);
  const src = getAssociatedTokenAddressSync(mint.publicKey, h.payer.publicKey, false, programId);
  assert.equal(unpackAccount(dest, h.account(dest), programId).amount, 250_000_000n);
  assert.equal(unpackAccount(src, h.account(src), programId).amount, 750_000_000n);
}

const name = process.argv[2];
const scenario = SCENARIOS[name];
if (!scenario) {
  writeSync(2, `unknown scenario "${name}". Choose one of: ${Object.keys(SCENARIOS).join(", ")}\n`);
  process.exit(2);
}
await scenario();
writeSync(1, `PASS ${name}\n`);
process.exit(0);
