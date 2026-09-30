// Diagnostic: mirrors tests/integration.test.ts step by step and logs before each native call,
// so a native abort shows which step caused it. Run: node --experimental-strip-types scripts/litesvm-smoke.mjs
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount, unpackMint } from "@solana/spl-token";
import { writeSync } from "node:fs";
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, mintRent, programFor } from "../lib/tx.ts";

const log = (m) => writeSync(1, `[smoke] ${m}\n`);
const { LiteSVM, FailedTransactionMetadata } = await import("litesvm");
const METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const svm = new LiteSVM();
const payer = Keypair.generate();
svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
log("setup ok");

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
const account = (label, pk) => {
  log(`getAccount: ${label}`);
  const a = svm.getAccount(pk);
  if (!a) throw new Error("missing " + label);
  log(`  -> ${a.data.length} bytes`);
  return { data: Buffer.from(a.data), owner: a.owner, lamports: Number(a.lamports), executable: a.executable };
};
const create = async (label, standard, over = {}) => {
  const mint = Keypair.generate();
  const base = { name: "Forge Coin", symbol: "FRG", uri: "https://tokenforge.example/api/meta?n=Forge+Coin&s=FRG" };
  log(`rent: ${label}`);
  const rentLamports = await mintRent(async (space) => Number(svm.minimumBalanceForRentExemption(BigInt(space))), { standard, ...base, mint: mint.publicKey });
  const plan = { standard, payer: payer.publicKey, mint, ...base, decimals: 6, supply: 1_000_000_000n, fixedSupply: false, rentLamports, ...over };
  send(label, buildCreateTokenIxs(plan).filter((ix) => !ix.programId.equals(METADATA)), [mint]);
  return mint;
};

const m1 = await create("1 spl create", "spl");
unpackMint(m1.publicKey, account("1 mint", m1.publicKey), TOKEN_PROGRAM_ID);
log("1 unpackMint ok");
const ata1 = getAssociatedTokenAddressSync(m1.publicKey, payer.publicKey, false, TOKEN_PROGRAM_ID);
unpackAccount(ata1, account("1 ata", ata1), TOKEN_PROGRAM_ID);
log("1 unpackAccount ok");

const m2 = await create("2 token2022 create", "token2022", { decimals: 9, supply: 5_000_000_000n });
unpackMint(m2.publicKey, account("2 mint", m2.publicKey), TOKEN_2022_PROGRAM_ID);
log("2 unpackMint ok");

const m3 = await create("3 spl fixed supply", "spl", { fixedSupply: true });
send("3 mint after revoke (expected FAILED)", buildMintIxs({ standard: "spl", mint: m3.publicKey, authority: payer.publicKey, amount: 1n }), []);

for (const standard of ["spl", "token2022"]) {
  const m = await create(`4 ${standard} create`, standard);
  send(`4 ${standard} mint more`, buildMintIxs({ standard, mint: m.publicKey, authority: payer.publicKey, amount: 500n }), []);
  const m5 = await create(`5 ${standard} create`, standard);
  const to = Keypair.generate().publicKey;
  send(`5 ${standard} transfer to new wallet`, buildTransferIxs({ standard, mint: m5.publicKey, from: payer.publicKey, to, amount: 250_000_000n, decimals: 6 }), []);
  const dest = getAssociatedTokenAddressSync(m5.publicKey, to, true, programFor(standard));
  unpackAccount(dest, account(`5 ${standard} dest`, dest), programFor(standard));
  log(`5 ${standard} unpackAccount ok`);
}

const m6 = await create("6 spl create", "spl");
const to6 = Keypair.generate().publicKey;
send("6 over-balance transfer (expected FAILED)", buildTransferIxs({ standard: "spl", mint: m6.publicKey, from: payer.publicKey, to: to6, amount: 2_000_000_000n, decimals: 6 }), []);
send("6 wrong-decimals transfer (expected FAILED)", buildTransferIxs({ standard: "spl", mint: m6.publicKey, from: payer.publicKey, to: to6, amount: 1n, decimals: 5 }), []);
log("all scenarios finished");
