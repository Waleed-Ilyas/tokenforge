"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { friendlyError } from "@/lib/explorer";

export type TxState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "confirming"; signature: string }
  | { status: "done"; signature: string }
  | { status: "error"; message: string; signature?: string };

/** Sign with the wallet (plus any extra keypair such as a new mint), send, and wait for confirmation. */
export function useTx() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (build: () => Promise<{ ixs: TransactionInstruction[]; signers?: Keypair[] }>) => {
      if (!publicKey) {
        setState({ status: "error", message: "Connect a wallet first." });
        return null;
      }
      let signature: string | undefined;
      try {
        setState({ status: "signing" });
        const { ixs, signers = [] } = await build();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
        signature = await sendTransaction(tx, connection, { signers });
        setState({ status: "confirming", signature });
        const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`The network rejected the transaction: ${JSON.stringify(res.value.err)}`);
        setState({ status: "done", signature });
        return signature;
      } catch (e) {
        setState({ status: "error", message: friendlyError(e), signature });
        return null;
      }
    },
    [connection, publicKey, sendTransaction],
  );

  return { state, run, reset: () => setState({ status: "idle" }) };
}
