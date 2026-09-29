// Downloads the deployed Metaplex Token Metadata program binary from devnet into tests/fixtures,
// so the LiteSVM integration test runs the real program without any network access.
// Usage: node scripts/dump-programs.mjs
import { Connection, PublicKey } from "@solana/web3.js";
import { mkdirSync, writeFileSync } from "node:fs";

const conn = new Connection(process.env.SOLANA_RPC_DEVNET ?? "https://api.devnet.solana.com", "confirmed");
const PROGRAMS = { "mpl_token_metadata.so": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" };
const PROGRAMDATA_HEADER = 45; // upgradeable loader: 4 tag + 8 slot + 1 option + 32 authority

mkdirSync(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
for (const [file, id] of Object.entries(PROGRAMS)) {
  const program = await conn.getAccountInfo(new PublicKey(id));
  if (!program) throw new Error(`Program ${id} not found`);
  const programData = new PublicKey(program.data.subarray(4, 36));
  const acct = await conn.getAccountInfo(programData);
  if (!acct) throw new Error(`Program data for ${id} not found`);
  const elf = acct.data.subarray(PROGRAMDATA_HEADER);
  writeFileSync(new URL(`../tests/fixtures/${file}`, import.meta.url), elf);
  console.log(`${file}: ${elf.length} bytes (${id})`);
}
