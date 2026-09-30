// Runs the transaction builders against the real SPL Token, Token-2022 and Associated Token programs inside LiteSVM
// (an in-process Solana VM). No network and no faucet needed.
// LiteSVM only ships native binaries for Linux and macOS, so on Windows this file is skipped and CI runs it.
// The Metaplex Token Metadata program is NOT executed here: LiteSVM aborts (SIGABRT) when it runs the deployed
// program binary. For SPL tokens the Metaplex instruction is stripped before sending and checked structurally instead.
import { beforeEach, describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, Transaction, type TransactionInstruction } from "@solana/web3.js";
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
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, metadataPda, mintRent, programFor, type CreatePlan } from "@/lib/tx";
import type { Standard } from "@/lib/validate";

type Lite = typeof import("litesvm");
let lite: Lite | null = null;
try {
  lite = await import("litesvm");
} catch {
  lite = null;
}
const suite = lite ? describe : describe.skip;

suite("on-chain behaviour (LiteSVM)", () => {
  let svm: InstanceType<Lite["LiteSVM"]>;
  const payer = Keypair.generate();

  const send = (ixs: TransactionInstruction[], signers: Keypair[]) => {
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.add(...ixs);
    tx.sign(payer, ...signers);
    return svm.sendTransaction(tx);
  };
  const ok = (r: ReturnType<typeof send>) => {
    if (r instanceof lite!.FailedTransactionMetadata) throw new Error(`Transaction failed: ${r.toString()}`);
  };
  const failed = (r: ReturnType<typeof send>) => r instanceof lite!.FailedTransactionMetadata;
  const account = (pk: Keypair["publicKey"]) => {
    const a = svm.getAccount(pk);
    if (!a) throw new Error(`account ${pk.toBase58()} missing`);
    return { data: Buffer.from(a.data), owner: a.owner, lamports: Number(a.lamports), executable: a.executable };
  };

  // A fresh VM per test. Reusing one LiteSVM instance across tests made the native code abort with std::bad_alloc
  // on a later transaction (seen on Linux with litesvm 0.5.0 and 0.8.0), so tests share no VM state.
  beforeEach(() => {
    svm = new lite!.LiteSVM();
    svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
  });

  const create = async (standard: Standard, over: Partial<CreatePlan> = {}) => {
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
    ok(send(ixs.filter((ix) => !ix.programId.equals(METADATA_PROGRAM_ID)), [mint]));
    return { mint, plan, ixs };
  };

  it("SPL: creates the mint and the initial supply, and prepares the Metaplex metadata instruction", async () => {
    const { mint, ixs } = await create("spl");
    const m = unpackMint(mint.publicKey, account(mint.publicKey), TOKEN_PROGRAM_ID);
    expect(m.decimals).toBe(6);
    expect(m.supply).toBe(1_000_000_000n);
    expect(m.mintAuthority?.equals(payer.publicKey)).toBe(true);
    expect(m.freezeAuthority).toBeNull();

    const ata = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, TOKEN_PROGRAM_ID);
    expect(unpackAccount(ata, account(ata), TOKEN_PROGRAM_ID).amount).toBe(1_000_000_000n);

    // Metaplex is not executed (see the note at the top), so check the instruction that would be sent.
    const metaIx = ixs.find((ix) => ix.programId.equals(METADATA_PROGRAM_ID))!;
    expect(metaIx.data[0]).toBe(33); // CreateMetadataAccountV3
    expect(metaIx.keys[0].pubkey.equals(metadataPda(mint.publicKey))).toBe(true);
    expect(metaIx.keys[1].pubkey.equals(mint.publicKey)).toBe(true);
    expect(metaIx.data.includes(Buffer.from("Forge Coin"))).toBe(true);
    expect(metaIx.data.includes(Buffer.from("FRG"))).toBe(true);
  });

  it("Token-2022: metadata is stored on the mint through the metadata-pointer extension", async () => {
    const { mint } = await create("token2022", { decimals: 9, supply: 5_000_000_000n });
    const m = unpackMint(mint.publicKey, account(mint.publicKey), TOKEN_2022_PROGRAM_ID);
    expect(m.decimals).toBe(9);
    expect(m.supply).toBe(5_000_000_000n);
    expect(getMetadataPointerState(m)?.metadataAddress?.equals(mint.publicKey)).toBe(true);
    const raw = getExtensionData(ExtensionType.TokenMetadata, m.tlvData);
    expect(raw).not.toBeNull();
    const meta = unpack(raw!);
    expect(meta.name).toBe("Forge Coin");
    expect(meta.symbol).toBe("FRG");
  });

  it("fixed supply revokes the mint authority and blocks further minting", async () => {
    const { mint } = await create("spl", { fixedSupply: true });
    expect(unpackMint(mint.publicKey, account(mint.publicKey), TOKEN_PROGRAM_ID).mintAuthority).toBeNull();
    expect(failed(send(buildMintIxs({ standard: "spl", mint: mint.publicKey, authority: payer.publicKey, amount: 1n }), []))).toBe(true);
  });

  it("minting more grows the supply while the authority is kept", async () => {
    for (const standard of ["spl", "token2022"] as const) {
      const { mint } = await create(standard);
      ok(send(buildMintIxs({ standard, mint: mint.publicKey, authority: payer.publicKey, amount: 500n }), []));
      const programId = programFor(standard);
      expect(unpackMint(mint.publicKey, account(mint.publicKey), programId).supply).toBe(1_000_000_500n);
    }
  });

  it("transfers to a wallet that has no token account yet, creating it", async () => {
    for (const standard of ["spl", "token2022"] as const) {
      const { mint } = await create(standard);
      const to = Keypair.generate().publicKey;
      ok(send(buildTransferIxs({ standard, mint: mint.publicKey, from: payer.publicKey, to, amount: 250_000_000n, decimals: 6 }), []));
      const programId = programFor(standard);
      const dest = getAssociatedTokenAddressSync(mint.publicKey, to, true, programId);
      const src = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, programId);
      expect(unpackAccount(dest, account(dest), programId).amount).toBe(250_000_000n);
      expect(unpackAccount(src, account(src), programId).amount).toBe(750_000_000n);
    }
  });

  it("refuses a transfer larger than the balance and one with the wrong decimals", async () => {
    const { mint } = await create("spl");
    const to = Keypair.generate().publicKey;
    expect(failed(send(buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: payer.publicKey, to, amount: 2_000_000_000n, decimals: 6 }), []))).toBe(
      true,
    );
    expect(failed(send(buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: payer.publicKey, to, amount: 1n, decimals: 5 }), []))).toBe(true);
  });
});
