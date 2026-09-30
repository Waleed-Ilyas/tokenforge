// 2 transactions
import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { buildMintIxs } from "@/lib/tx";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("fixed supply (LiteSVM)", () => {
  it("revokes the mint authority and blocks further minting", async () => {
    const h = harness(lite!);
    const { mint } = await h.createToken("spl", { fixedSupply: true });
    expect(unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_PROGRAM_ID).mintAuthority).toBeNull();
    expect(h.isFailure(h.send(buildMintIxs({ standard: "spl", mint: mint.publicKey, authority: h.payer.publicKey, amount: 1n })))).toBe(true);
  });
});
