import { PublicKey, type Connection, type ParsedAccountData } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { metadataPda } from "./tx";
import type { Standard } from "./validate";

export type OwnedToken = {
  mint: string;
  standard: Standard;
  decimals: number;
  /** Balance in base units. */
  amount: bigint;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  /** True when the connected wallet can still mint more of this token. */
  canMint: boolean;
};

const trim = (s: string) => s.replace(/\0+$/, "").trim();

/** Every token the wallet holds (SPL and Token-2022) with its name, symbol and whether the wallet is the mint authority. */
export async function loadOwnedTokens(conn: Connection, owner: PublicKey): Promise<OwnedToken[]> {
  const [spl, t22] = await Promise.all([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const rows = [...spl.value.map((v) => ({ v, standard: "spl" as Standard })), ...t22.value.map((v) => ({ v, standard: "token2022" as Standard }))]
    .map(({ v, standard }) => {
      const info = v.account.data.parsed.info;
      return { mint: info.mint as string, standard, decimals: info.tokenAmount.decimals as number, amount: BigInt(info.tokenAmount.amount) };
    })
    .filter((r) => r.amount > 0n)
    .slice(0, 30);
  if (rows.length === 0) return [];

  const mints = rows.map((r) => new PublicKey(r.mint));
  const [mintAccounts, metaAccounts] = await Promise.all([conn.getMultipleParsedAccounts(mints), conn.getMultipleAccountsInfo(mints.map(metadataPda))]);

  return rows.map((r, i) => {
    const parsed = mintAccounts.value[i]?.data as ParsedAccountData | undefined;
    const info = parsed?.parsed?.info;
    let name: string | null = null;
    let symbol: string | null = null;
    let uri: string | null = null;
    if (r.standard === "token2022") {
      const ext = (info?.extensions as { extension: string; state: { name?: string; symbol?: string; uri?: string } }[] | undefined)?.find(
        (e) => e.extension === "tokenMetadata",
      );
      name = ext?.state.name ?? null;
      symbol = ext?.state.symbol ?? null;
      uri = ext?.state.uri ?? null;
    } else if (metaAccounts[i]) {
      try {
        const [meta] = Metadata.deserialize(Buffer.from(metaAccounts[i]!.data));
        name = trim(meta.data.name);
        symbol = trim(meta.data.symbol);
        uri = trim(meta.data.uri);
      } catch {
        /* metadata account exists but is not decodable, show the mint address instead */
      }
    }
    return { ...r, name, symbol, uri, canMint: info?.mintAuthority === owner.toBase58() };
  });
}
