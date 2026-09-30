// Diagnostic: runs one LiteSVM scenario per process so a native abort in one does not hide the others.
// Usage: node --experimental-strip-types scripts/litesvm-smoke.mjs <scenario>
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { AuthorityType, TOKEN_PROGRAM_ID, createSetAuthorityInstruction } from "@solana/spl-token";
import { writeSync } from "node:fs";
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, mintRent } from "../lib/tx.ts";

const log = (m) => writeSync(1, `[smoke] ${m}\n`);
const { LiteSVM, FailedTransactionMetadata } = await import("litesvm");
const METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const scenario = process.argv[2];

const svm = new LiteSVM();
const payer = Keypair.generate();
svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

const send = (label, ixs, signers) => {
  log(`send: ${label}`);
  const tx = new Transaction();
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = payer.publicKey;
  tx.add(...ixs);
  tx.sign(payer, ...signers);
  const res = svm.sendTransaction(tx);
  const failed = res instanceof FailedTransactionMetadata;
  log(`  -> ${failed ? "FAILED" : "ok"}`);
  return failed;
};
const create = async (standard, over = {}) => {
  const mint = Keypair.generate();
  const base = { name: "Forge Coin", symbol: "FRG", uri: "https://tokenforge.example/api/meta?n=Forge+Coin&s=FRG" };
  const rentLamports = await mintRent(async (space) => Number(svm.minimumBalanceForRentExemption(BigInt(space))), { standard, ...base, mint: mint.publicKey });
  const plan = { standard, payer: payer.publicKey, mint, ...base, decimals: 6, supply: 1_000_000_000n, fixedSupply: false, rentLamports, ...over };
  const failed = send(`create ${standard}${over.fixedSupply ? " fixed" : ""}`, buildCreateTokenIxs(plan).filter((ix) => !ix.programId.equals(METADATA)), [mint]);
  return { mint, failed };
};

const scenarios = {
  // a transaction that must fail, with no token setup at all
  failing_tx: async () => send("transfer from a missing account", buildTransferIxs({ standard: "spl", mint: Keypair.generate().publicKey, from: payer.publicKey, to: Keypair.generate().publicKey, amount: 1n, decimals: 6 }), []),
  // setAuthority in its own transaction on a healthy mint
  set_authority_alone: async () => {
    const { mint } = await create("spl");
    send("setAuthority(MintTokens -> null) alone", [createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)], []);
  },
  fixed_supply_create: async () => create("spl", { fixedSupply: true }),
  mint_more: async () => {
    const { mint } = await create("spl");
    send("mint more", buildMintIxs({ standard: "spl", mint: mint.publicKey, authority: payer.publicKey, amount: 500n }), []);
  },
  transfer_spl: async () => {
    const { mint } = await create("spl");
    send("transfer spl", buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: payer.publicKey, to: Keypair.generate().publicKey, amount: 250_000_000n, decimals: 6 }), []);
  },
  transfer_token2022: async () => {
    const { mint } = await create("token2022");
    send("transfer token2022", buildTransferIxs({ standard: "token2022", mint: mint.publicKey, from: payer.publicKey, to: Keypair.generate().publicKey, amount: 250_000_000n, decimals: 6 }), []);
  },
  over_balance: async () => {
    const { mint } = await create("spl");
    send("over-balance transfer", buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: payer.publicKey, to: Keypair.generate().publicKey, amount: 2_000_000_000n, decimals: 6 }), []);
  },
  wrong_decimals: async () => {
    const { mint } = await create("spl");
    send("wrong-decimals transfer", buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: payer.publicKey, to: Keypair.generate().publicKey, amount: 1n, decimals: 5 }), []);
  },
};

if (!scenarios[scenario]) {
  log(`unknown scenario ${scenario}; choose one of ${Object.keys(scenarios).join(", ")}`);
  process.exit(2);
}
log(`=== ${scenario} ===`);
await scenarios[scenario]();
log(`${scenario}: finished without abort`);
