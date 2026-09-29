export const dynamic = "force-dynamic";

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** A generated 256px SVG badge for tokens without a custom image. The symbol is restricted to A-Z and 0-9, so it is safe to inline. */
export function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("s") ?? "").toUpperCase();
  const symbol = /^[A-Z0-9]{1,10}$/.test(raw) ? raw : "TKN";
  const h = hue(symbol);
  const size = symbol.length <= 3 ? 84 : symbol.length <= 5 ? 58 : 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${symbol}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 42%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 70% 22%)"/></linearGradient></defs>
<circle cx="128" cy="128" r="124" fill="url(#g)"/><circle cx="128" cy="128" r="112" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3"/>
<text x="128" y="128" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="#fff">${symbol}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
}
