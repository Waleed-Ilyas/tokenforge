export const U64_MAX = 18_446_744_073_709_551_615n;

export class AmountError extends Error {}

/**
 * Turn a human amount such as "1000.5" into base units for a token with `decimals` decimals.
 * Exact (string arithmetic, no floats). Rejects negatives, too many decimals, zero and anything above u64.
 */
export function parseAmount(input: string, decimals: number): bigint {
  const value = input.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new AmountError("Enter a positive number, for example 1000 or 2.5.");
  const [whole, frac = ""] = value.split(".");
  if (frac.length > decimals)
    throw new AmountError(
      decimals === 0 ? "This token has 0 decimals, so only whole numbers are allowed." : `This token allows at most ${decimals} decimal places.`,
    );
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  if (units === 0n) throw new AmountError("The amount must be greater than zero.");
  if (units > U64_MAX) throw new AmountError("That amount is larger than a token supply can hold (u64).");
  return units;
}

/** Base units back to a readable string, without trailing zeros. */
export function formatAmount(units: bigint, decimals: number): string {
  if (decimals === 0) return units.toLocaleString("en-US");
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = BigInt(s.slice(0, -decimals)).toLocaleString("en-US");
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
