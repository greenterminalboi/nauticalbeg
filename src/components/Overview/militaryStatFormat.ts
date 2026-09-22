// specs/012-firepower-tab: shared display helpers for Army/Navy Stats.
import type { UnitTypeStats } from "./unitTypeReference";

const ROMAN_AGES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
};

/** Renders an internal 1-6 age tier as the roman numeral the spec asks
 * for (I-VI) — display formatting only, never stored as roman text. */
export function toRomanAge(age: 1 | 2 | 3 | 4 | 5 | 6): string {
  return ROMAN_AGES[age];
}

/** One matched modifier source contributing to a computed stat's total —
 * carried alongside the total so a hover breakdown can show exactly
 * which advances/reforms/privileges/laws/societal-value extremes
 * produced the number, not just the number itself. */
export interface ModifierBreakdownEntry {
  sourceKind: "advance" | "reform" | "privilege" | "law" | "societal_value";
  sourceName: string;
  value: number;
}

/** Shape every computed-stat column (discipline, tactics, fort limit,
 * siege ability, fort defense) carries, so a table can render the
 * "partial total" marker (spec FR-013) and a hover breakdown without a
 * separate lookup — never a bare number for these five stats. */
export interface PartialStat {
  value: number;
  isPartial: true;
  breakdown: ModifierBreakdownEntry[];
}

const SOURCE_KIND_LABELS: Record<ModifierBreakdownEntry["sourceKind"], string> = {
  advance: "Advance",
  reform: "Reform",
  privilege: "Privilege",
  law: "Law",
  societal_value: "Societal Value",
};

function formatSourceName(sourceName: string): string {
  return sourceName.replace(/_/g, " ");
}

/** Same "kind: name" label `formatBreakdownTooltip` builds per line, for
 * a caller that wants to render a breakdown as real markup (e.g. Army
 * Composition's always-visible source list) rather than tooltip text. */
export function formatModifierSource(entry: ModifierBreakdownEntry): string {
  return `${SOURCE_KIND_LABELS[entry.sourceKind]}: ${formatSourceName(entry.sourceName)}`;
}

/** Renders a PartialStat's breakdown as multi-line plain text, for a
 * hover tooltip (spec-independent formatting helper so Army/Navy Stats
 * tables don't duplicate this string-building logic). */
export function formatBreakdownTooltip(stat: PartialStat): string {
  if (stat.breakdown.length === 0) {
    return "No matching source currently active — partial total (see footnote).";
  }
  const lines = stat.breakdown.map(
    (entry) =>
      `${SOURCE_KIND_LABELS[entry.sourceKind]}: ${formatSourceName(entry.sourceName)} (${entry.value >= 0 ? "+" : ""}${entry.value})`,
  );
  return `${lines.join("\n")}\n= ${stat.value.toFixed(2)} (partial — excludes character traits)`;
}

/** specs/012-firepower-tab (post-ship, explicit user request): one
 * regiment/ship type's real composition, for a "what's actually in this
 * number" hover breakdown on Regiments / per-class ship-count columns. */
export interface RegimentBreakdownEntry {
  unitType: string;
  displayCategory: string;
  isLevy: boolean;
  regimentCount: number;
  totalNumber: number;
  /** user request 2026-09-22: this unit type's own combat stats, for
   * Army Composition's always-visible Regiment Composition table. */
  stats: UnitTypeStats;
  /** user request 2026-09-22: this unit type's own age tier, for a
   * small badge next to its name in the same table. */
  age: 1 | 2 | 3 | 4 | 5 | 6;
}

/** Strips the `a_`/`n_` save-internal prefix and renders the rest as
 * Title Case — this project has no access to the game's real
 * localization strings (constitution Principle IV: no fabricated
 * display names), so this is a readable rendering of the save's own
 * identifier, not a claim it matches the in-game display name exactly. */
export function formatUnitTypeName(unitType: string): string {
  const withoutPrefix = unitType.replace(/^[an]_/, "");
  return withoutPrefix
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Renders a regiment/ship composition breakdown as multi-line plain
 * text: one line per unit type, its headcount, and levy/regular status,
 * for a hover tooltip on a Regiments or per-class ship-count cell. */
export function formatRegimentBreakdownTooltip(breakdown: readonly RegimentBreakdownEntry[], noun: "regiment" | "ship"): string {
  if (breakdown.length === 0) {
    return `No ${noun}s.`;
  }
  const lines = breakdown.map((entry) => {
    const plural = entry.regimentCount === 1 ? noun : `${noun}s`;
    const levyTag = entry.isLevy ? " (levy)" : "";
    return `${formatUnitTypeName(entry.unitType)}${levyTag}: ${entry.totalNumber} (${entry.regimentCount} ${plural})`;
  });
  return lines.join("\n");
}
