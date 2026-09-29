import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { buildCreateTokenIxs, buildMintIxs, buildTransferIxs, metadataPda, mintRent, type CreatePlan } from "@/lib/tx";

const payer = Keypair.generate().publicKey;
const plan = (over: Partial<CreatePlan> = {}): CreatePlan => ({
  standard: "spl",
  payer,
  mint: Keypair.generate(),
  name: "Forge Coin",
  symbol: "FRG",
  uri: "https://x.io/api/meta?n=Forge+Coin&s=FRG",
  decimals: 6,
  supply: 1_000_000_000n,
  fixedSupply: false,
  rentLamports: 1_461_600,
  ...over,
});
const programs = (ixs: { programId: PublicKey }[]) => ixs.map((i) => i.programId.toBase58());

describe("buildCreateTokenIxs", () => {
  it("SPL: create account, init mint, Metaplex metadata, token account, mint", () => {
    const ixs = buildCreateTokenIxs(plan());
    expect(programs(ixs)).toEqual(
      [SystemProgram.programId, TOKEN_PROGRAM_ID, METADATA_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID].map((p) => p.toBase58()),
    );
  });
  it("SPL: fixed supply adds a final set-authority instruction", () => {
    const base = buildCreateTokenIxs(plan()).length;
    const fixed = buildCreateTokenIxs(plan({ fixedSupply: true }));
    expect(fixed.length).toBe(base + 1);
    expect(fixed[fixed.length - 1].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });
  it("Token-2022: metadata lives on the mint, no Metaplex account", () => {
    const ixs = buildCreateTokenIxs(plan({ standard: "token2022" }));
    expect(ixs.some((i) => i.programId.equals(METADATA_PROGRAM_ID))).toBe(false);
    expect(ixs.filter((i) => i.programId.equals(TOKEN_2022_PROGRAM_ID)).length).toBeGreaterThanOrEqual(4);
    expect(ixs[0].programId.equals(SystemProgram.programId)).toBe(true);
  });
  it("the mint keypair and the payer are the only signers of the create instruction", () => {
    const p = plan();
    const create = buildCreateTokenIxs(p)[0];
    const signers = create.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
    expect(signers.sort()).toEqual([payer.toBase58(), p.mint.publicKey.toBase58()].sort());
  });
});

describe("mintRent", () => {
  it("Token-2022 asks for more space than SPL because metadata is stored on the mint", async () => {
    const asked: number[] = [];
    const rent = async (space: number) => {
      asked.push(space);
      return space * 10;
    };
    const mint = Keypair.generate().publicKey;
    await mintRent(rent, { standard: "spl", name: "A", symbol: "A", uri: "u", mint });
    await mintRent(rent, { standard: "token2022", name: "A", symbol: "A", uri: "u", mint });
    expect(asked[0]).toBe(82);
    expect(asked[1]).toBeGreaterThan(asked[0]);
  });
});

describe("metadataPda", () => {
  it("is deterministic per mint", () => {
    const m = Keypair.generate().publicKey;
    expect(metadataPda(m).equals(metadataPda(m))).toBe(true);
    expect(metadataPda(m).equals(metadataPda(Keypair.generate().publicKey))).toBe(false);
  });
});

describe("mint and transfer builders", () => {
  it("mint: idempotent token account then mintTo", () => {
    expect(buildMintIxs({ standard: "spl", mint: Keypair.generate().publicKey, authority: payer, amount: 5n })).toHaveLength(2);
  });
  it("transfer: creates the recipient account idempotently, then transferChecked", () => {
    const ixs = buildTransferIxs({
      standard: "token2022",
      mint: Keypair.generate().publicKey,
      from: payer,
      to: Keypair.generate().publicKey,
      amount: 5n,
      decimals: 6,
    });
    expect(programs(ixs)).toEqual([ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
  });
  it("transfer to an off-curve address (a PDA) is allowed", () => {
    const pda = PublicKey.findProgramAddressSync([Buffer.from("vault")], Keypair.generate().publicKey)[0];
    expect(() => buildTransferIxs({ standard: "spl", mint: Keypair.generate().publicKey, from: payer, to: pda, amount: 1n, decimals: 0 })).not.toThrow();
  });
});
