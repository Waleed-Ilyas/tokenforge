// Runs each on-chain scenario (tests/support/scenarios.ts) in its own Node process and checks for its PASS marker.
// See the header of that file for why these are child processes. Skipped where LiteSVM has no native binary (Windows).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(__dirname, "support", "scenarios.ts");
const nodeArgs = ["--experimental-strip-types", "--no-warnings"];

const probe = spawnSync(process.execPath, ["-e", 'import("litesvm").then(() => console.log("LITE_OK")).catch(() => console.log("LITE_NO"))'], {
  encoding: "utf8",
  timeout: 30_000,
});
const available = (probe.stdout ?? "").includes("LITE_OK");

const SCENARIOS = [
  ["SPL: creates the mint and supply, and prepares the Metaplex instruction", "spl-create"],
  ["Token-2022: stores the metadata on the mint through extensions", "token2022-create"],
  ["fixed supply revokes the mint authority and blocks further minting", "fixed-supply"],
  ["SPL: minting more grows the supply and keeps the authority", "mint-more-spl"],
  ["Token-2022: minting more grows the supply and keeps the authority", "mint-more-token2022"],
  ["SPL: transfers to a wallet with no token account, creating it", "transfer-spl"],
  ["Token-2022: transfers to a wallet with no token account, creating it", "transfer-token2022"],
  ["refuses a transfer larger than the balance", "transfer-over-balance"],
  ["refuses a transfer that states the wrong decimals", "transfer-wrong-decimals"],
] as const;

describe.skipIf(!available)("on-chain behaviour (LiteSVM, one process per scenario)", () => {
  for (const [title, id] of SCENARIOS) {
    it(title, () => {
      const r = spawnSync(process.execPath, [...nodeArgs, script, id], { encoding: "utf8", timeout: 60_000 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      // The native VM may abort while the process shuts down, after the assertions held, so judge the marker.
      expect(out.includes(`PASS ${id}`), out.slice(-1500)).toBe(true);
    });
  }
});
