// 1 transaction
import { describe, expect, it } from "vitest";
import { ExtensionType, TOKEN_2022_PROGRAM_ID, getExtensionData, getMetadataPointerState, unpackMint } from "@solana/spl-token";
import { unpack } from "@solana/spl-token-metadata";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("Token-2022 creation (LiteSVM)", () => {
  it("stores the metadata on the mint through the metadata-pointer and token-metadata extensions", async () => {
    const h = harness(lite!);
    const { mint } = await h.createToken("token2022", { decimals: 9, supply: 5_000_000_000n });
    const m = unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_2022_PROGRAM_ID);
    expect(m.decimals).toBe(9);
    expect(m.supply).toBe(5_000_000_000n);
    expect(getMetadataPointerState(m)?.metadataAddress?.equals(mint.publicKey)).toBe(true);
    const raw = getExtensionData(ExtensionType.TokenMetadata, m.tlvData);
    expect(raw).not.toBeNull();
    const meta = unpack(raw!);
    expect(meta.name).toBe("Forge Coin");
    expect(meta.symbol).toBe("FRG");
    expect(meta.uri).toContain("/api/meta");
  });
});
