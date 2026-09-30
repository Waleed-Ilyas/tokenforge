// 2 transactions
import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { buildMintIxs } from "@/lib/tx";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("minting more, spl (LiteSVM)", () => {
  it("grows the supply while the authority is kept", async () => {
    const h = harness(lite!);
    const { mint } = await h.createToken("spl");
    h.expectOk(h.send(buildMintIxs({ standard: "spl", mint: mint.publicKey, authority: h.payer.publicKey, amount: 500n })));
    const m = unpackMint(mint.publicKey, h.account(mint.publicKey), TOKEN_PROGRAM_ID);
    expect(m.supply).toBe(1_000_000_500n);
    expect(m.mintAuthority?.equals(h.payer.publicKey)).toBe(true);
  });
});
