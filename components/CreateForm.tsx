"use client";
import { useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { parseAmount } from "@/lib/amount";
import { explorerAddress } from "@/lib/explorer";
import { UriError, buildMetadataUri } from "@/lib/metadata-uri";
import { buildCreateTokenIxs, mintRent } from "@/lib/tx";
import { CreateSchema, fieldErrors, type Standard } from "@/lib/validate";
import { TxStatus } from "./TxStatus";
import { useTx } from "./useTx";

const input =
  "mono min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-4 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-accent aria-[invalid=true]:border-danger";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function CreateForm({ onCreated }: { onCreated: () => void }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { state, run, reset } = useTx();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [standard, setStandard] = useState<Standard>("spl");
  const [created, setCreated] = useState<{ mint: string; symbol: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreated(null);
    reset();
    const fd = new FormData(formRef.current!);
    const parsed = CreateSchema.safeParse({
      name: fd.get("name"),
      symbol: fd.get("symbol"),
      description: fd.get("description") ?? "",
      imageUrl: fd.get("imageUrl") ?? "",
      decimals: fd.get("decimals"),
      supply: fd.get("supply"),
      standard,
      fixedSupply: fd.get("fixedSupply") === "on",
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    let uri: string;
    try {
      uri = buildMetadataUri(window.location.origin, { name: v.name, symbol: v.symbol, description: v.description, imageUrl: v.imageUrl });
    } catch (err) {
      return setErrors({ form: err instanceof UriError ? err.message : "Could not build the metadata link." });
    }
    setErrors({});
    if (!publicKey) return setErrors({ form: "Connect a wallet first." });

    const mint = Keypair.generate();
    const sig = await run(async () => {
      const rentLamports = await mintRent((space) => connection.getMinimumBalanceForRentExemption(space), {
        standard,
        name: v.name,
        symbol: v.symbol,
        uri,
        mint: mint.publicKey,
      });
      const ixs = buildCreateTokenIxs({
        standard,
        payer: publicKey,
        mint,
        name: v.name,
        symbol: v.symbol,
        uri,
        decimals: v.decimals,
        supply: parseAmount(v.supply, v.decimals),
        fixedSupply: v.fixedSupply,
        rentLamports,
      });
      return { ixs, signers: [mint] };
    });
    if (sig) {
      setCreated({ mint: mint.publicKey.toBase58(), symbol: v.symbol });
      onCreated();
    }
  };

  const busy = state.status === "signing" || state.status === "confirming";
  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-error` : undefined });

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="card grid gap-5" aria-label="Create a token">
      <fieldset className="grid gap-2">
        <legend className="label mb-1">Standard</legend>
        {(
          [
            ["spl", "SPL Token", "The classic standard. Name and symbol are stored with Metaplex Token Metadata. Works in every wallet."],
            ["token2022", "Token-2022", "The newer program. Name, symbol and link are stored directly on the mint through the metadata extension."],
          ] as const
        ).map(([id, title, body]) => (
          <label key={id} className="relative block cursor-pointer">
            <input type="radio" name="standard" value={id} checked={standard === id} onChange={() => setStandard(id)} className="peer sr-only" />
            <span className="block rounded-[12px] border border-line px-4 py-3 transition-colors peer-checked:border-accent peer-checked:bg-elevated peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:border-line-strong">
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-[13px] text-ink-2">{body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Name" error={err("name")}>
          <input id="name" name="name" className={input} placeholder="Forge Coin" maxLength={40} autoComplete="off" {...aria("name")} />
        </Field>
        <Field id="symbol" label="Symbol" error={err("symbol")}>
          <input id="symbol" name="symbol" className={`${input} uppercase`} placeholder="FRG" maxLength={12} autoComplete="off" {...aria("symbol")} />
        </Field>
        <Field id="decimals" label="Decimals" hint="6 is common, 9 matches SOL, 0 for whole units." error={err("decimals")}>
          <input id="decimals" name="decimals" type="number" min={0} max={9} step={1} defaultValue={6} className={input} {...aria("decimals")} />
        </Field>
        <Field id="supply" label="Initial supply" hint="Minted to your wallet." error={err("supply")}>
          <input id="supply" name="supply" inputMode="decimal" className={input} placeholder="1000000" autoComplete="off" {...aria("supply")} />
        </Field>
      </div>

      <Field id="description" label="Description (optional)" error={err("description")}>
        <input
          id="description"
          name="description"
          className={input}
          placeholder="What is this token for?"
          maxLength={130}
          autoComplete="off"
          {...aria("description")}
        />
      </Field>
      <Field
        id="imageUrl"
        label="Image link (optional)"
        hint="A full https:// link. Leave empty and a badge is generated from the symbol."
        error={err("imageUrl")}
      >
        <input id="imageUrl" name="imageUrl" type="url" className={input} placeholder="https://…" autoComplete="off" {...aria("imageUrl")} />
      </Field>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="fixedSupply" className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-medium">Fixed supply</span>
          <span className="block text-[13px] text-ink-2">
            Give up the mint authority right after minting. Nobody, including you, can create more of this token afterwards.
          </span>
        </span>
      </label>

      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : publicKey ? "Create token" : "Connect a wallet to create"}
        </button>
        <TxStatus state={state} doneText="Token created." />
      </div>

      {created && (
        <div className="rounded-[12px] border border-accent/40 bg-elevated p-4 text-sm" role="status">
          <p className="font-medium">{created.symbol} is live on devnet.</p>
          <p className="mono mt-1 break-all text-ink-2">{created.mint}</p>
          <a
            className="mt-2 inline-block underline underline-offset-4 hover:text-accent"
            href={explorerAddress(created.mint)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View the mint on Solana Explorer
          </a>
          <p className="mt-2 text-[13px] text-ink-3">It now appears in My tokens, where you can mint more or send it.</p>
        </div>
      )}
    </form>
  );
}
