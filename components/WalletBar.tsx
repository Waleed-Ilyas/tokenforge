"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { explorerTx, friendlyError } from "@/lib/explorer";

export function WalletBar({ refreshKey, onFunded }: { refreshKey: number; onFunded: () => void }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string; sig?: string } | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return setBalance(null);
    try {
      setBalance((await connection.getBalance(publicKey, "confirmed")) / LAMPORTS_PER_SOL);
    } catch {
      setBalance(null);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const airdrop = async () => {
    if (!publicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setNote({ kind: "ok", text: "1 devnet SOL added.", sig });
      await load();
      onFunded();
    } catch (e) {
      const base = friendlyError(e);
      setNote({
        kind: "error",
        text:
          /airdrop|429|faucet/i.test(String(e)) || /rate limiting/.test(base)
            ? "The devnet faucet is rate limited right now. Use faucet.solana.com, then come back."
            : base,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="label">Devnet wallet</p>
        <p className="mono mt-1 text-lg tabular-nums">{publicKey ? (balance === null ? "…" : `${balance.toFixed(3)} SOL`) : "Not connected"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {publicKey && (
          <button className="btn" onClick={airdrop} disabled={busy}>
            {busy ? "Requesting…" : "Airdrop 1 devnet SOL"}
          </button>
        )}
        <WalletMultiButton />
      </div>
      {note && (
        <p className={`w-full text-sm ${note.kind === "ok" ? "text-accent" : "text-danger"}`} role={note.kind === "error" ? "alert" : "status"}>
          {note.text}{" "}
          {note.sig && (
            <a className="underline underline-offset-4" href={explorerTx(note.sig)} target="_blank" rel="noopener noreferrer">
              View transaction
            </a>
          )}
          {note.kind === "error" && (
            <a className="underline underline-offset-4" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">
              faucet.solana.com
            </a>
          )}
        </p>
      )}
    </div>
  );
}
