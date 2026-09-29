import { describe, expect, it } from "vitest";
import { CreateSchema, fieldErrors } from "@/lib/validate";
import { MAX_URI, UriError, buildMetadataUri } from "@/lib/metadata-uri";

const ok = { name: "Forge Coin", symbol: "frg", description: "", imageUrl: "", decimals: 6, supply: "1000000", standard: "spl" as const, fixedSupply: false };

describe("CreateSchema", () => {
  it("accepts a valid form and uppercases the symbol", () => {
    expect(CreateSchema.parse(ok).symbol).toBe("FRG");
  });
  it("reports each problem against its own field", () => {
    const r = CreateSchema.safeParse({ ...ok, name: "", symbol: "way-too-long-symbol!", decimals: 12, supply: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["decimals", "name", "supply", "symbol"]);
  });
  it("checks the supply against the chosen decimals", () => {
    expect(CreateSchema.safeParse({ ...ok, decimals: 0, supply: "1.5" }).success).toBe(false);
  });
  it("only accepts https image links", () => {
    expect(CreateSchema.safeParse({ ...ok, imageUrl: "http://x.io/a.png" }).success).toBe(false);
    expect(CreateSchema.safeParse({ ...ok, imageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(CreateSchema.safeParse({ ...ok, imageUrl: "https://x.io/a.png" }).success).toBe(true);
  });
});

describe("buildMetadataUri", () => {
  it("builds a link under the limit", () => {
    const uri = buildMetadataUri("https://tokenforge.example/", { name: "Forge Coin", symbol: "FRG" });
    expect(uri.length).toBeLessThanOrEqual(MAX_URI);
    expect(uri).toBe("https://tokenforge.example/api/meta?n=Forge+Coin&s=FRG");
  });
  it("refuses to truncate when the link is too long", () => {
    expect(() =>
      buildMetadataUri("https://tokenforge.example", {
        name: "A",
        symbol: "A",
        description: "x".repeat(120),
        imageUrl: "https://example.com/" + "a".repeat(80),
      }),
    ).toThrow(UriError);
  });
});
