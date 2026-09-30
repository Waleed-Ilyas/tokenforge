// End-to-end run on real devnet with a throwaway keypair, using the same builders the browser uses.
// It closes the two gaps the LiteSVM tests cannot: the Metaplex Token Metadata program (which aborts LiteSVM)
// and real RPC confirmation.
//
//   SOLANA_RPC_DEVNET=<devnet rpc url> [DEVNET_KEYPAIR=<path to a keypair json>] node --experimental-strip-types scripts/devnet-e2e.ts
//
// Without DEVNET_KEYPAIR a throwaway keypair is generated and funded by an airdrop. The public faucet is often
// exhausted, so you can instead point DEVNET_KEYPAIR at a devnet-only keypair file and fund its address at
// https://faucet.solana.com. Use a throwaway key, never one that holds real funds. The RPC URL is never printed.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getMint, getTokenMetadata, getAccount } from "@solana/spl-token";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, metadataPda, mintRent } from "../lib/tx.ts";
import type { Standard } from "../lib/validate.ts";

const rpc = process.env.SOLANA_RPC_DEVNET;
if (!rpc) throw new Error("Set SOLANA_RPC_DEVNET to a devnet RPC URL.");
const conn = new Connection(rpc, "confirmed");
const keypairFile = process.env.DEVNET_KEYPAIR;
const payer =
  keypairFile && existsSync(keypairFile) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairFile, "utf8")))) : Keypair.generate();
const link = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const step = (m: string) => console.log(`\n== ${m}`);

const send = async (ixs: TransactionInstruction[], signers: Keypair[] = []) => {
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, ...signers], { commitment: "confirmed" });
  console.log(`   ${link(sig)}`);
  return sig;
};

const create = async (standard: Standard, over: { fixedSupply?: boolean; decimals?: number; supply?: bigint } = {}) => {
  const mint = Keypair.generate();
  const meta = { name: "Forge E2E", symbol: "FE2E", uri: "https://tokenforge-tau.vercel.app/api/meta?n=Forge+E2E&s=FE2E" };
  const rentLamports = await mintRent((space) => conn.getMinimumBalanceForRentExemption(space), { standard, ...meta, mint: mint.publicKey });
  const ixs = buildCreateTokenIxs({
    standard,
    payer: payer.publicKey,
    mint,
    ...meta,
    decimals: over.decimals ?? 6,
    supply: over.supply ?? 1_000_000_000n,
    fixedSupply: over.fixedSupply ?? false,
    rentLamports,
  });
  await send(ixs, [mint]);
  console.log(`   mint ${mint.publicKey.toBase58()}`);
  return { mint: mint.publicKey, meta };
};

step("fund the wallet");
console.log(`   wallet ${payer.publicKey.toBase58()}`);
const NEEDED = 0.5 * LAMPORTS_PER_SOL;
if ((await conn.getBalance(payer.publicKey)) < NEEDED) {
  try {
    const airdrop = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature: airdrop, ...bh }, "confirmed");
  } catch {
    console.error(`
The airdrop failed (the faucet is rate limited). Fund this address with devnet SOL, then run the script again:
  ${payer.publicKey.toBase58()}
  https://faucet.solana.com`);
    process.exit(3);
  }
}
console.log(`   balance ${(await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

step("SPL token with Metaplex metadata");
{
  const { mint, meta } = await create("spl");
  const m = await getMint(conn, mint, "confirmed", TOKEN_PROGRAM_ID);
  assert.equal(m.decimals, 6);
  assert.equal(m.supply, 1_000_000_000n);
  assert.ok(m.mintAuthority?.equals(payer.publicKey));
  const onchain = await Metadata.fromAccountAddress(conn, metadataPda(mint));
  assert.equal(onchain.data.name.replace(/\0+$/, ""), meta.name);
  assert.equal(onchain.data.symbol.replace(/\0+$/, ""), meta.symbol);
  assert.equal(onchain.data.uri.replace(/\0+$/, ""), meta.uri);
  assert.ok(onchain.updateAuthority.equals(payer.publicKey));
  console.log("   PASS: mint, supply, authority and Metaplex metadata read back from devnet");

  step("mint more, then send to a wallet with no token account");
  await send(buildMintIxs({ standard: "spl", mint, authority: payer.publicKey, amount: 500n }));
  assert.equal((await getMint(conn, mint, "confirmed", TOKEN_PROGRAM_ID)).supply, 1_000_000_500n);
  const to = Keypair.generate().publicKey;
  await send(buildTransferIxs({ standard: "spl", mint, from: payer.publicKey, to, amount: 250_000_000n, decimals: 6 }));
  const dest = await getAccount(conn, getAssociatedTokenAddressSync(mint, to, true, TOKEN_PROGRAM_ID), "confirmed", TOKEN_PROGRAM_ID);
  assert.equal(dest.amount, 250_000_000n);
  console.log("   PASS: supply grew by 500 units and the recipient received 250 tokens");
}

step("Token-2022 with on-chain metadata");
{
  const { mint, meta } = await create("token2022", { decimals: 9, supply: 5_000_000_000n });
  const m = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  assert.equal(m.decimals, 9);
  assert.equal(m.supply, 5_000_000_000n);
  const md = await getTokenMetadata(conn, mint);
  assert.ok(md);
  assert.equal(md.name, meta.name);
  assert.equal(md.symbol, meta.symbol);
  assert.equal(md.uri, meta.uri);
  console.log("   PASS: Token-2022 mint and its metadata extension read back from devnet");
}

step("fixed supply");
{
  const { mint } = await create("spl", { fixedSupply: true });
  assert.equal((await getMint(conn, mint, "confirmed", TOKEN_PROGRAM_ID)).mintAuthority, null);
  await assert.rejects(() => send(buildMintIxs({ standard: "spl", mint, authority: payer.publicKey, amount: 1n })), "minting after revoke must fail");
  console.log("   PASS: mint authority revoked, further minting rejected by the network");
}

console.log(`\nAll devnet checks passed. Wallet balance left: ${(await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);
