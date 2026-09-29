import { z } from "zod";
import { parseAmount, AmountError } from "./amount";

export type Standard = "spl" | "token2022";

export const CreateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the token a name.").max(32, "Names can be at most 32 characters."),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Give the token a symbol.")
      .max(10, "Symbols can be at most 10 characters.")
      .regex(/^[A-Z0-9]+$/, "Use letters and numbers only."),
    description: z.string().trim().max(120, "Keep the description under 120 characters.").optional().default(""),
    imageUrl: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Use a full https:// link, or leave it empty for a generated image."),
    decimals: z.coerce.number().int("Decimals must be a whole number.").min(0).max(9, "Decimals can be at most 9."),
    supply: z.string().trim(),
    standard: z.enum(["spl", "token2022"]),
    fixedSupply: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    try {
      parseAmount(v.supply, v.decimals);
    } catch (e) {
      ctx.addIssue({ code: "custom", path: ["supply"], message: e instanceof AmountError ? e.message : "Invalid supply." });
    }
  });

export type CreateInput = z.input<typeof CreateSchema>;
export type CreateValues = z.output<typeof CreateSchema>;

/** Field name to first error message, ready to render next to the inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
