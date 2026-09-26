// SC-003 calibration against the battles the real save recorded
// (research.md §8). Report mode: it asserts the harness covers every
// recorded battle and prints the figures; it is not a hard gate until the
// open damage entries in combat-unknowns.md (U-01…U-03, U-32) are resolved
// — constants are never tuned to make this pass.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calibrate } from "../../tools/battle-sim-reference/calibrate";
import type { ReferenceBattle } from "../../tools/battle-sim-reference/extract-reference-battles";

const battles = JSON.parse(readFileSync("tests/fixtures/battle-sim/reference-battles.json", "utf-8")) as ReferenceBattle[];

describe("battle simulator calibration (report)", () => {
  it("replays every recorded land battle and reports winner agreement and loss error", () => {
    const report = calibrate(battles, 20);
    expect(report.battles + report.skipped.length).toBe(battles.length);
    console.info(
      `[019 calibration] ${report.battles} battles × ${report.seeds} seeds; skipped ${report.skipped.length} (U-45). ` +
        `Winner agreement ${(report.winnerAgreement * 100).toFixed(0)}% (target ≥80%); ` +
        `winner losses within 25%: ${(report.lossWithin25 * 100).toFixed(0)}%, median error ${(report.medianWinnerLossError * 100).toFixed(0)}%`,
    );
    expect(report.winnerAgreement).toBeGreaterThan(0);
  });
});
