// 1 transaction
import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount, unpackMint } from "@solana/spl-token";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { metadataPda } from "@/lib/tx";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("SPL token creation (LiteSVM)", () => {
  it("creates the mint and the initial supply, and prepares the Metaplex metadata instruction", async () => {
    const h = harness(lite!);
    const { mint, ixs } = await h.createToken("spl");

    const m = unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_PROGRAM_ID);
    expect(m.decimals).toBe(6);
    expect(m.supply).toBe(1_000_000_000n);
    expect(m.mintAuthority?.equals(h.payer.publicKey)).toBe(true);
    expect(m.freezeAuthority).toBeNull();

    const ata = getAssociatedTokenAddressSync(mint.publicKey, h.payer.publicKey, false, TOKEN_PROGRAM_ID);
    expect(unpackAccount(ata, h.account(ata), TOKEN_PROGRAM_ID).amount).toBe(1_000_000_000n);

    // Metaplex is not executed (see tests/support/svm.ts), so check the instruction that would be sent.
    const metaIx = ixs.find((ix) => ix.programId.equals(METADATA_PROGRAM_ID))!;
    expect(metaIx.data[0]).toBe(33); // CreateMetadataAccountV3
    expect(metaIx.keys[0].pubkey.equals(metadataPda(mint.publicKey))).toBe(true);
    expect(metaIx.keys[1].pubkey.equals(mint.publicKey)).toBe(true);
    expect(metaIx.data.includes(Buffer.from("Forge Coin"))).toBe(true);
    expect(metaIx.data.includes(Buffer.from("FRG"))).toBe(true);
  });
});
