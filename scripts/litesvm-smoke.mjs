// Step-by-step LiteSVM check that logs before each native call, so a native crash shows where it happened.
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSync } from "node:fs";

const log = (m) => writeSync(1, `[smoke] ${m}\n`);
const { LiteSVM, FailedTransactionMetadata } = await import("litesvm");
log("imported litesvm");
const svm = new LiteSVM();
log("created LiteSVM");
const payer = Keypair.generate();
svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
log("airdrop ok");
const tx = new Transaction();
tx.recentBlockhash = svm.latestBlockhash();
tx.feePayer = payer.publicKey;
tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1000 }));
tx.sign(payer);
const res = svm.sendTransaction(tx);
log(`transfer ${res instanceof FailedTransactionMetadata ? "FAILED " + res.toString() : "ok"}`);
const so = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "mpl_token_metadata.so");
log("adding metadata program");
svm.addProgramFromFile(new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), so);
log("metadata program loaded");
