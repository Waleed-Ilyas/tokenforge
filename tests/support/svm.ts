// Shared harness for the on-chain tests. They run the transaction builders against the real SPL Token, Token-2022
// and Associated Token programs inside LiteSVM, an in-process Solana VM (no network, no faucet).
//
// Constraints found while building this, all observed on Linux CI with litesvm 0.5.0 and 0.8.0:
//  - LiteSVM ships native binaries for Linux and macOS only, so on Windows these tests skip themselves.
//  - The deployed Metaplex Token Metadata program aborts the VM when executed, so that instruction is removed
//    before sending (see `createToken`) and asserted structurally instead.
//  - The native code aborts with std::bad_alloc around the third transaction in a process, so every test file in
//    tests/onchain sends at most two transactions and vitest runs each file in its own worker.
import { Keypair, LAMPORTS_PER_SOL, Transaction, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { buildCreateTokenIxs, mintRent, type CreatePlan } from "@/lib/tx";
import type { Standard } from "@/lib/validate";

export type Lite = typeof import("litesvm");

/** The litesvm module, or null where it has no native binary (Windows). */
export async function loadLite(): Promise<Lite | null> {
  try {
    return await import("litesvm");
  } catch {
    return null;
  }
}

export function harness(lite: Lite) {
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
  const isFailure = (r: ReturnType<typeof send>) => r instanceof lite.FailedTransactionMetadata;
  const expectOk = (r: ReturnType<typeof send>) => {
    if (isFailure(r)) throw new Error(`Transaction failed: ${r.toString()}`);
  };
  const account = (pk: PublicKey) => {
    const a = svm.getAccount(pk);
    if (!a) throw new Error(`account ${pk.toBase58()} missing`);
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

  return { svm, payer, send, isFailure, expectOk, account, createToken };
}
