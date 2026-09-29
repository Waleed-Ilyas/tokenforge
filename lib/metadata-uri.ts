// Metaplex Token Metadata limits: URI 200 chars, name 32, symbol 10.
export const MAX_URI = 200;

export type MetaFields = { name: string; symbol: string; description?: string; imageUrl?: string; color?: string };

export class UriError extends Error {}

/**
 * Public URL of the metadata JSON that this app serves for a token, with every field in the query string.
 * There is no database and no upload step. If it does not fit into the 200-character limit the user is told
 * what to shorten instead of the value being silently truncated.
 */
export function buildMetadataUri(origin: string, f: MetaFields): string {
  const q = new URLSearchParams();
  q.set("n", f.name);
  q.set("s", f.symbol);
  if (f.description) q.set("d", f.description);
  if (f.imageUrl) q.set("i", f.imageUrl);
  const uri = `${origin.replace(/\/$/, "")}/api/meta?${q.toString()}`;
  if (uri.length > MAX_URI) {
    throw new UriError(
      `The metadata link would be ${uri.length} characters and the limit is ${MAX_URI}. Shorten the description or image link, or leave the image empty to use a generated one.`,
    );
  }
  return uri;
}

/** URL of the generated SVG used when the token has no custom image. */
export function generatedImageUrl(origin: string, symbol: string): string {
  return `${origin.replace(/\/$/, "")}/api/token-image?s=${encodeURIComponent(symbol)}`;
}
