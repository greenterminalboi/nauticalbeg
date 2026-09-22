// specs/012-firepower-tab (post-ship): pure helpers for
// MilitaryDoctrineChart, kept outside the component so the doctrine-
// sentence logic and tooltip content are both testable without
// rendering anything — same precedent as compassPosition.ts.
//
// Post-ship history: the original three-strip-plot layout was replaced
// with one parallel-coordinates chart (see MilitaryDoctrineChart.tsx's
// own doc comment). The per-axis modifier-breakdown tooltip content
// that redesign shipped with was then replaced again — explicit user
// request — with a short plain-language doctrine sentence derived
// directly from the three axis scores, e.g. "Expect to fight a
// naval-focused, offensive, high-quantity military." `doctrineModifiersForAxis`
// and its modifier-listing tooltip lines were removed outright (no
// other caller) rather than left unused.
import type { MilitaryDoctrineAxis } from "./MilitaryDoctrineChart";

export interface DoctrineAxisReading {
  axis: MilitaryDoctrineAxis;
  title: string;
  /** null = the -999 "not applicable" sentinel, already filtered out at
   * the query layer — never fabricated as a centrist 0; excluded from
   * the doctrine sentence entirely, same as a near-zero score is. */
  value: number | null;
}

// A score within this many units of 0 reads as "no real lean" on that
// axis — its descriptor is dropped from the sentence rather than forcing
// a pick between two poles that are both barely true. Explicit user
// example: -25..25 on Offensive/Defensive should drop that axis's
// adjective entirely.
const NEUTRAL_THRESHOLD = 25;

const POLE_DESCRIPTORS: Record<MilitaryDoctrineAxis, { negative: string; positive: string }> = {
  land_vs_naval: { negative: "land-focused", positive: "naval-focused" },
  offensive_vs_defensive: { negative: "offensive", positive: "defensive" },
  quality_vs_quantity: { negative: "high-quality", positive: "high-quantity" },
};

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Builds the one-sentence doctrine description: one descriptor per
 * axis whose score is both applicable (not the -999 sentinel) and past
 * `NEUTRAL_THRESHOLD` in either direction, joined into a single
 * sentence. A country with no axis past the threshold (or no applicable
 * axes at all) gets an honest "balanced, doctrine-neutral" sentence
 * rather than an empty or fabricated one. */
export function describeDoctrine(axes: readonly DoctrineAxisReading[]): string {
  const descriptors: string[] = [];
  for (const { axis, value } of axes) {
    if (value === null || Math.abs(value) <= NEUTRAL_THRESHOLD) continue;
    const poles = POLE_DESCRIPTORS[axis];
    descriptors.push(value < 0 ? poles.negative : poles.positive);
  }
  if (descriptors.length === 0) {
    return "Expect to fight a balanced, doctrine-neutral military.";
  }
  return `Expect to fight a ${joinWithAnd(descriptors)} military.`;
}

/** Builds one country's full hover tooltip (HTML, for ECharts' tooltip
 * formatter): the exact value at every axis (or "not applicable" for a
 * locked one), followed by the one-sentence doctrine description. */
export function formatDoctrineLineTooltip(name: string, tag: string, axes: readonly DoctrineAxisReading[]): string {
  const header = `<strong>${name} (${tag})</strong>`;
  const axisLines = axes.map(({ title, value }) => (value === null ? `${title}: not applicable` : `${title}: ${value.toFixed(1)}`));
  return `${header}<br/>${axisLines.join("<br/>")}<br/><br/>${describeDoctrine(axes)}`;
}
