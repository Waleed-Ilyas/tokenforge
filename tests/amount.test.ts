import { describe, expect, it } from "vitest";
import { AmountError, formatAmount, parseAmount, U64_MAX } from "@/lib/amount";

describe("parseAmount", () => {
  it("converts whole and fractional amounts exactly", () => {
    expect(parseAmount("1000", 6)).toBe(1_000_000_000n);
    expect(parseAmount("2.5", 6)).toBe(2_500_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
    expect(parseAmount("  42 ", 0)).toBe(42n);
  });
  it("is exact where floating point is not", () => {
    expect(parseAmount("0.1", 9)).toBe(100_000_000n);
    expect(parseAmount("1234567890.123456789", 9)).toBe(1_234_567_890_123_456_789n);
  });
  it("rejects bad input with a readable message", () => {
    for (const bad of ["", "abc", "-1", "1e5", "1,5", ".5", "5."]) expect(() => parseAmount(bad, 6)).toThrow(AmountError);
  });
  it("rejects more decimals than the token has", () => {
    expect(() => parseAmount("1.5", 0)).toThrow(/whole numbers/);
    expect(() => parseAmount("1.1234567", 6)).toThrow(/at most 6/);
  });
  it("rejects zero and anything above u64", () => {
    expect(() => parseAmount("0", 6)).toThrow(/greater than zero/);
    expect(() => parseAmount("0.000000", 6)).toThrow(/greater than zero/);
    expect(parseAmount(U64_MAX.toString(), 0)).toBe(U64_MAX);
    expect(() => parseAmount((U64_MAX + 1n).toString(), 0)).toThrow(/u64/);
  });
});

describe("formatAmount", () => {
  it("formats with grouping and trims trailing zeros", () => {
    expect(formatAmount(1_000_000_000n, 6)).toBe("1,000");
    expect(formatAmount(2_500_000n, 6)).toBe("2.5");
    expect(formatAmount(1n, 6)).toBe("0.000001");
    expect(formatAmount(1234n, 0)).toBe("1,234");
  });
  it("round-trips with parseAmount", () => {
    for (const s of ["1", "0.5", "1234.5678"]) expect(parseAmount(formatAmount(parseAmount(s, 6), 6).replace(/,/g, ""), 6)).toBe(parseAmount(s, 6));
  });
});
