import { explorerTx } from "@/lib/explorer";
import type { TxState } from "./useTx";

const link = "underline underline-offset-4 hover:text-accent";

export function TxStatus({ state, doneText }: { state: TxState; doneText: string }) {
  return (
    <div role="status" aria-live="polite" className="min-h-6 text-sm">
      {state.status === "signing" && <p className="text-ink-2">Approve the request in your wallet…</p>}
      {state.status === "confirming" && (
        <p className="text-ink-2">
          Sent, waiting for confirmation…{" "}
          <a className={link} href={explorerTx(state.signature)} target="_blank" rel="noopener noreferrer">
            View on Explorer
          </a>
        </p>
      )}
      {state.status === "done" && (
        <p className="text-accent">
          {doneText}{" "}
          <a className={link} href={explorerTx(state.signature)} target="_blank" rel="noopener noreferrer">
            View transaction
          </a>
        </p>
      )}
      {state.status === "error" && (
        <p className="text-danger" role="alert">
          {state.message}{" "}
          {state.signature && (
            <a className={link} href={explorerTx(state.signature)} target="_blank" rel="noopener noreferrer">
              Check status
            </a>
          )}
        </p>
      )}
    </div>
  );
}
