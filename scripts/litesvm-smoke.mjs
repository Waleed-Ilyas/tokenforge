// Step-by-step LiteSVM check that logs before each native call, so a native crash shows where it happened.
// Run with: node --experimental-strip-types scripts/litesvm-smoke.mjs
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSync } from "node:fs";
import { buildCreateTokenIxs, mintRent } from "../lib/tx.ts";

const log = (m) => writeSync(1, `[smoke] ${m}\n`);
const { LiteSVM, FailedTransactionMetadata } = await import("litesvm");
const METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const so = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "mpl_token_metadata.so");

const svm = new LiteSVM();
const payer = Keypair.generate();
svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
svm.addProgramFromFile(METADATA, so);
log("setup ok (metadata program loaded)");

const send = (label, ixs, signers) => {
  log(`sending: ${label}`);
  const tx = new Transaction();
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = payer.publicKey;
  tx.add(...ixs);
  tx.sign(payer, ...signers);
  const res = svm.sendTransaction(tx);
  log(`${label}: ${res instanceof FailedTransactionMetadata ? "FAILED " + res.toString() : "ok"}`);
};

const plan = async (standard, over = {}) => {
  const mint = Keypair.generate();
  const base = { name: "Forge Coin", symbol: "FRG", uri: "https://tokenforge.example/api/meta?n=Forge+Coin&s=FRG" };
  const rentLamports = await mintRent(async (space) => Number(svm.minimumBalanceForRentExemption(BigInt(space))), { standard, ...base, mint: mint.publicKey });
  return { mint, p: { standard, payer: payer.publicKey, mint, ...base, decimals: 6, supply: 1_000_000_000n, fixedSupply: false, rentLamports, ...over } };
};

// A: SPL without the Metaplex instruction (only built-in programs)
{
  const { mint, p } = await plan("spl");
  const ixs = buildCreateTokenIxs(p).filter((ix) => !ix.programId.equals(METADATA));
  send("A spl create WITHOUT metadata", ixs, [mint]);
}
// C: Token-2022 (built-in program only)
{
  const { mint, p } = await plan("token2022");
  send("C token2022 create", buildCreateTokenIxs(p), [mint]);
}
// B: SPL with Metaplex metadata (executes the dumped program)
{
  const { mint, p } = await plan("spl");
  send("B spl create WITH metadata", buildCreateTokenIxs(p), [mint]);
}
log("all scenarios finished");
