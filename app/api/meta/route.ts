import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const clean = (v: string | null, max: number) =>
  (v ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);

/**
 * Metaplex fungible-token metadata JSON, built from the query string so the app needs no database or upload step.
 * Only https image links are passed through, everything else falls back to the generated SVG.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const name = clean(url.searchParams.get("n"), 32);
  const symbol = clean(url.searchParams.get("s"), 10).toUpperCase();
  if (!name || !/^[A-Z0-9]+$/.test(symbol)) return NextResponse.json({ error: "Missing or invalid name or symbol." }, { status: 400 });
  const custom = clean(url.searchParams.get("i"), 300);
  const image = /^https:\/\/\S+$/.test(custom) ? custom : `${url.origin}/api/token-image?s=${symbol}`;
  return NextResponse.json(
    { name, symbol, description: clean(url.searchParams.get("d"), 120), image, properties: { files: [{ uri: image, type: "image/*" }], category: "image" } },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } },
  );
}
