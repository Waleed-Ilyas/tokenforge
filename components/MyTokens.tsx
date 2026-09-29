"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AmountError, formatAmount, parseAmount } from "@/lib/amount";
import { loadOwnedTokens, type OwnedToken } from "@/lib/chain";
import { explorerAddress, friendlyError, shorten } from "@/lib/explorer";
import { buildMintIxs, buildTransferIxs } from "@/lib/tx";
import { CopyButton } from "./CopyButton";
import { TxStatus } from "./TxStatus";
import { useTx } from "./useTx";

const input =
  "mono min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-4 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-accent aria-[invalid=true]:border-danger";

function TokenCard({ token, onChanged }: { token: OwnedToken; onChanged: () => void }) {
  const { publicKey } = useWallet();
  const { state, run, reset } = useTx();
  const [panel, setPanel] = useState<"none" | "mint" | "send">("none");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = state.status === "signing" || state.status === "confirming";
  const title = token.symbol || token.name || shorten(token.mint);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;
    setError(null);
    reset();
    let units: bigint;
    try {
      units = parseAmount(amount, token.decimals);
    } catch (err) {
      return setError(err instanceof AmountError ? err.message : "Invalid amount.");
    }
    const mint = new PublicKey(token.mint);
    if (panel === "mint") {
      const sig = await run(async () => ({ ixs: buildMintIxs({ standard: token.standard, mint, authority: publicKey, amount: units }) }));
      if (sig) {
        setAmount("");
        onChanged();
      }
      return;
    }
    let dest: PublicKey;
    try {
      dest = new PublicKey(to.trim());
    } catch {
      return setError("That is not a valid Solana address.");
    }
    if (units > token.amount) return setError(`You only hold ${formatAmount(token.amount, token.decimals)} ${title}.`);
    const sig = await run(async () => ({
      ixs: buildTransferIxs({ standard: token.standard, mint, from: publicKey, to: dest, amount: units, decimals: token.decimals }),
    }));
    if (sig) {
      setAmount("");
      setTo("");
      onChanged();
    }
  };

  return (
    <li className="card grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display text-3xl">{title}</p>
          <p className="text-sm text-ink-2">{token.name && token.name !== title ? token.name : token.standard === "spl" ? "SPL Token" : "Token-2022"}</p>
          <p className="mono mt-1 flex flex-wrap items-center gap-2 text-ink-3">
            <a className="break-all hover:text-accent" href={explorerAddress(token.mint)} target="_blank" rel="noopener noreferrer">
              {shorten(token.mint, 6, 6)}
            </a>
            <CopyButton value={token.mint} />
          </p>
        </div>
        <div className="text-right">
          <p className="label">Balance</p>
          <p className="mono text-xl tabular-nums">{formatAmount(token.amount, token.decimals)}</p>
          <p className="mt-1 text-[12px] text-ink-3">
            {token.standard === "spl" ? "SPL" : "Token-2022"} · {token.decimals} decimals
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${title}`}>
        <button className="btn" aria-pressed={panel === "send"} onClick={() => (reset(), setError(null), setPanel(panel === "send" ? "none" : "send"))}>
          Send
        </button>
        {token.canMint ? (
          <button className="btn" aria-pressed={panel === "mint"} onClick={() => (reset(), setError(null), setPanel(panel === "mint" ? "none" : "mint"))}>
            Mint more
          </button>
        ) : (
          <span className="label self-center">Mint authority: not you</span>
        )}
      </div>

      {panel !== "none" && (
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-3 border-t border-line pt-4"
          aria-label={panel === "mint" ? `Mint more ${title}` : `Send ${title}`}
        >
          {panel === "send" && (
            <div>
              <label htmlFor={`to-${token.mint}`} className="label block">
                Recipient address
              </label>
              <input
                id={`to-${token.mint}`}
                className={`${input} mt-1.5`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Wallet address"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
          <div>
            <label htmlFor={`amt-${token.mint}`} className="label block">
              Amount
            </label>
            <input
              id={`amt-${token.mint}`}
              className={`${input} mt-1.5`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Working…" : panel === "mint" ? "Mint" : "Send"}
            </button>
            <TxStatus state={state} doneText={panel === "mint" ? "Minted." : "Sent."} />
          </div>
          {panel === "send" && (
            <p className="text-[13px] text-ink-3">
              The recipient&apos;s token account is created for you if it does not exist yet. That costs a little devnet SOL.
            </p>
          )}
        </form>
      )}
    </li>
  );
}

export function MyTokens({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<OwnedToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return setTokens(null);
    try {
      setError(null);
      setTokens(await loadOwnedTokens(connection, publicKey));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [connection, publicKey]);

  useEffect(() => {
    setTokens(null);
    load();
  }, [load, refreshKey]);

  if (!publicKey) return <p className="card text-ink-2">Connect a wallet to see the tokens it holds.</p>;
  if (error)
    return (
      <div role="alert" className="card border-danger/40">
        <p className="font-medium text-danger">Could not load your tokens</p>
        <p className="mt-1 text-sm text-ink-2">{error}</p>
        <button className="btn mt-4" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (tokens === null)
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading tokens">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    );
  if (tokens.length === 0) return <p className="card text-ink-2">This wallet holds no tokens yet. Create one in the first tab and it will show up here.</p>;
  return (
    <ul className="grid gap-4">
      {tokens.map((t) => (
        <TokenCard key={t.mint} token={t} onChanged={onChanged} />
      ))}
    </ul>
  );
}
