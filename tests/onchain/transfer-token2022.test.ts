// 2 transactions
import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import { buildTransferIxs } from "@/lib/tx";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("transfer, token2022 (LiteSVM)", () => {
  it("sends to a wallet that has no token account yet, creating it", async () => {
    const h = harness(lite!);
    const { mint } = await h.createToken("token2022");
    const to = Keypair.generate().publicKey;
    h.expectOk(h.send(buildTransferIxs({ standard: "token2022", mint: mint.publicKey, from: h.payer.publicKey, to, amount: 250_000_000n, decimals: 6 })));
    const dest = getAssociatedTokenAddressSync(mint.publicKey, to, true, TOKEN_2022_PROGRAM_ID);
    const src = getAssociatedTokenAddressSync(mint.publicKey, h.payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    expect(unpackAccount(dest, h.account(dest), TOKEN_2022_PROGRAM_ID).amount).toBe(250_000_000n);
    expect(unpackAccount(src, h.account(src), TOKEN_2022_PROGRAM_ID).amount).toBe(750_000_000n);
  });
});
