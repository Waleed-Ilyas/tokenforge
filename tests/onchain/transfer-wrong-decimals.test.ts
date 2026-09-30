// 2 transactions
import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { buildTransferIxs } from "@/lib/tx";
import { harness, loadLite } from "../support/svm";

const lite = await loadLite();

(lite ? describe : describe.skip)("transfer decimals check (LiteSVM)", () => {
  it("refuses a transfer that states the wrong decimals", async () => {
    const h = harness(lite!);
    const { mint } = await h.createToken("spl");
    const to = Keypair.generate().publicKey;
    expect(h.isFailure(h.send(buildTransferIxs({ standard: "spl", mint: mint.publicKey, from: h.payer.publicKey, to, amount: 1n, decimals: 5 })))).toBe(true);
  });
});
