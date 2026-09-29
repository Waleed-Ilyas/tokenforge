export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;
export const shorten = (v: string, head = 4, tail = 4) => (v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`);

/** Turn wallet and RPC failures into one sentence a person can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declin/i.test(msg)) return "You cancelled the request in your wallet. Nothing was sent.";
  if (/insufficient|0x1\b|debit an account|attempt to debit/i.test(msg))
    return "Not enough devnet SOL to pay for this. Use the airdrop button, then try again.";
  if (/429|rate limit|too many requests/i.test(msg)) return "The public devnet RPC is rate limiting requests. Wait a few seconds and try again.";
  if (/blockhash|expired|timed out|timeout/i.test(msg)) return "The transaction expired before it was confirmed. Try again.";
  if (/wallet not connected|WalletNotConnected/i.test(msg)) return "Connect a wallet first.";
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
