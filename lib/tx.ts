import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { PROGRAM_ID as METADATA_PROGRAM_ID, createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";
import type { Standard } from "./validate";

// Everything here only builds instructions. Signing and sending happen in the wallet (browser) or a keypair (tests),
// so the same code path is used in both.

export const programFor = (standard: Standard) => (standard === "spl" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID);

export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()], METADATA_PROGRAM_ID)[0];
}

export type CreatePlan = {
  standard: Standard;
  payer: PublicKey;
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  /** Initial supply in base units. */
  supply: bigint;
  /** Give up the mint authority after minting, so the supply can never grow. */
  fixedSupply: boolean;
  /** Lamports for the mint account. Use `mintRent` to compute it from a connection. */
  rentLamports: number;
};

/** Space and the metadata length that Token-2022 needs on the mint account itself. */
export function token2022Layout(meta: Pick<CreatePlan, "name" | "symbol" | "uri"> & { mint: PublicKey }) {
  const tokenMetadata: TokenMetadata = { mint: meta.mint, name: meta.name, symbol: meta.symbol, uri: meta.uri, additionalMetadata: [] };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(tokenMetadata).length;
  return { tokenMetadata, mintLen, metadataLen };
}

/** Rent for the mint account. Token-2022 pays for its metadata up front because the account grows when metadata is written. */
export async function mintRent(
  getRent: (space: number) => Promise<number>,
  plan: Pick<CreatePlan, "standard" | "name" | "symbol" | "uri"> & { mint: PublicKey },
): Promise<number> {
  if (plan.standard === "spl") return getRent(MINT_SIZE);
  const { mintLen, metadataLen } = token2022Layout(plan);
  return getRent(mintLen + metadataLen);
}

/** One transaction: create the mint, attach metadata, create the owner's token account, mint the supply, optionally lock it. */
export function buildCreateTokenIxs(plan: CreatePlan): TransactionInstruction[] {
  const { payer, mint, decimals } = plan;
  const programId = programFor(plan.standard);
  const ixs: TransactionInstruction[] = [];

  if (plan.standard === "spl") {
    ixs.push(
      SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: plan.rentLamports, programId }),
      createInitializeMint2Instruction(mint.publicKey, decimals, payer, null, programId),
      createCreateMetadataAccountV3Instruction(
        { metadata: metadataPda(mint.publicKey), mint: mint.publicKey, mintAuthority: payer, payer, updateAuthority: payer },
        {
          createMetadataAccountArgsV3: {
            data: { name: plan.name, symbol: plan.symbol, uri: plan.uri, sellerFeeBasisPoints: 0, creators: null, collection: null, uses: null },
            isMutable: true,
            collectionDetails: null,
          },
        },
      ),
    );
  } else {
    const { tokenMetadata, mintLen } = token2022Layout({ ...plan, mint: mint.publicKey });
    ixs.push(
      SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint.publicKey, space: mintLen, lamports: plan.rentLamports, programId }),
      createInitializeMetadataPointerInstruction(mint.publicKey, payer, mint.publicKey, programId),
      createInitializeMint2Instruction(mint.publicKey, decimals, payer, null, programId),
      createInitializeInstruction({
        programId,
        metadata: mint.publicKey,
        updateAuthority: payer,
        mint: mint.publicKey,
        mintAuthority: payer,
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        uri: tokenMetadata.uri,
      }),
    );
  }

  const ata = getAssociatedTokenAddressSync(mint.publicKey, payer, false, programId);
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mint.publicKey, programId),
    createMintToInstruction(mint.publicKey, ata, payer, plan.supply, [], programId),
  );
  if (plan.fixedSupply) ixs.push(createSetAuthorityInstruction(mint.publicKey, payer, AuthorityType.MintTokens, null, [], programId));
  return ixs;
}

/** Mint more of an existing token to the authority's own token account. */
export function buildMintIxs(args: { standard: Standard; mint: PublicKey; authority: PublicKey; amount: bigint }): TransactionInstruction[] {
  const programId = programFor(args.standard);
  const ata = getAssociatedTokenAddressSync(args.mint, args.authority, false, programId);
  return [
    createAssociatedTokenAccountIdempotentInstruction(args.authority, ata, args.authority, args.mint, programId),
    createMintToInstruction(args.mint, ata, args.authority, args.amount, [], programId),
  ];
}

/** Send tokens to any wallet, creating the recipient's token account first if it does not exist (the sender pays the rent). */
export function buildTransferIxs(args: {
  standard: Standard;
  mint: PublicKey;
  from: PublicKey;
  to: PublicKey;
  amount: bigint;
  decimals: number;
}): TransactionInstruction[] {
  const programId = programFor(args.standard);
  const source = getAssociatedTokenAddressSync(args.mint, args.from, false, programId);
  const dest = getAssociatedTokenAddressSync(args.mint, args.to, true, programId);
  return [
    createAssociatedTokenAccountIdempotentInstruction(args.from, dest, args.to, args.mint, programId),
    createTransferCheckedInstruction(source, args.mint, dest, args.from, args.amount, args.decimals, [], programId),
  ];
}
