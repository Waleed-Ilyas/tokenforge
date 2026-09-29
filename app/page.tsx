import { App } from "@/components/App";

export default function Home() {
  return (
    <main className="wrap py-10 md:py-16">
      <header className="mb-10 max-w-[720px]">
        <p className="label">Solana token launcher</p>
        <h1 className="display mt-3 text-[clamp(44px,6.5vw,80px)]">
          Forge a token in <em>one transaction</em>.
        </h1>
        <p className="mt-5 text-lg text-ink-2">
          Name it, size the supply, pick the standard. TokenForge creates the mint, attaches its metadata, and mints the supply to your wallet, on devnet.
        </p>
      </header>
      <App />
      <footer className="mt-16 border-t border-line pt-6 text-[13px] text-ink-3">
        A personal project by{" "}
        <a
          className="text-ink-2 underline underline-offset-4 hover:text-accent"
          href="https://github.com/Waleed-Ilyas"
          target="_blank"
          rel="noopener noreferrer"
        >
          Waleed Ilyas
        </a>
        . Devnet only: these tokens have no value and no transaction here touches mainnet.
      </footer>
    </main>
  );
}
