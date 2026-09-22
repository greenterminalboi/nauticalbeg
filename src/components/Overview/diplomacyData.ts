// specs/013-diplomatic-relations-chord data-model.md/contracts/queries.md:
// decoded, in-memory forms of listDiplomaticRelationsArrow/
// listRelationTrustArrow's Arrow IPC results (leaderboardData.ts's
// loadLeaderboardCountries precedent — direct apache-arrow decode, no
// Perspective needed for this shape), plus the chord-diagram view-model
// builder (arc ordering, per-type chord styling, hugbox-aware layout)
// built on top of them.
//
// Default country selection (explicit user request, superseding the
// original plan's "major powers by development" default): reuses
// `computeDefaultSelection`/`AddCountryInput` exactly like Leaderboard/
// World Goods/Societal Compass — human-played countries by default, with
// the same search-and-toggle control to add others. `loadLeaderboardCountries`
// already restricts to `country_type = 'Real'` AND currently owning
// territory, so dead/defunct tags never reach this feature either
// (explicit user request — already satisfied by reusing that query
// unchanged, no extra filtering needed here).
import { tableFromIPC } from "apache-arrow";
import { listDiplomaticRelationsArrow, listRelationTrustArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import {
  computeDefaultSelection,
  loadLeaderboardCountries,
  type LeaderboardCountry,
} from "./leaderboardData";
import { NEUTRAL_COLOR } from "./mapLayers";

/** Same shape as `LeaderboardCountry` under the name `contracts/ui.md`
 * uses in `DiplomacyChordChartProps` — this feature reuses
 * `LeaderboardCountry`/`loadLeaderboardCountries` unchanged
 * (contracts/queries.md: "no new query needed"). */
export type DiplomacyCountry = LeaderboardCountry;

// Post-ship, 2026-09-22 (explicit user request, cross-checked against
// every distinct relation_type/entry the real save's diplomacy_manager
// block actually contains): widened from the original 4 to include
// military_access, food_access, fleet_basing_rights (scripted_mutual/
// scripted_oneway object= values, same extraction path as alliance/
// guarantee) and economic_support (its own top-level entry type, same
// first/second/start_date shape as royal_marriage). "War" was raised as
// a candidate too but deliberately left out — a directed attacker/
// defender relationship from the separate `wars` table, not a
// diplomacy_manager entry, and a big enough shape mismatch from the
// other 8 that it needs its own follow-up decision, not a filter-set
// widening.
export type RelationType =
  | "alliance"
  | "rivalry"
  | "royal_marriage"
  | "guarantee"
  | "military_access"
  | "food_access"
  | "fleet_basing_rights"
  | "economic_support";

export interface DiplomaticRelationship {
  firstNationIdx: number;
  secondNationIdx: number;
  relationType: RelationType;
  startDate: string | null;
  /** Ducat amount granted — only ever non-null when `relationType ===
   * "economic_support"` (data-model.md). */
  amount: number | null;
  /** Whether this relation is directional (runs `firstNationIdx ->
   * secondNationIdx`) or symmetric — derived from which
   * diplomacy_manager container the row came from, exhaustively
   * confirmed against the real save: alliance is always mutual; every
   * other treaty type, guarantee included, is always one-way. Royal
   * marriage and rivalry are inherently symmetric; economic_support is
   * a one-directional grant by nature. See schema.sql's
   * `diplomatic_relations.is_one_way` comment. */
  isOneWay: boolean;
}

export interface NationRelationTrust {
  ownerNationIdx: number;
  targetNationIdx: number;
  trust: number;
  /** Derived "Opinion" score (spec: "diplomatic score... 200 to -200"),
   * a sum of `timed_biases.Opinion[]`/`Antagonism[]` modifier values —
   * `null` when the save recorded no timed biases at all for this pair
   * (never a fabricated 0, constitution Principle IV). See schema.sql's
   * `nation_relation_trust.opinion_score` comment for the full
   * derivation. */
  opinionScore: number | null;
}

const RELATION_TYPES: readonly RelationType[] = [
  "alliance",
  "rivalry",
  "royal_marriage",
  "guarantee",
  "military_access",
  "food_access",
  "fleet_basing_rights",
  "economic_support",
];

function asRelationType(value: unknown): RelationType | null {
  return typeof value === "string" && (RELATION_TYPES as readonly string[]).includes(value)
    ? (value as RelationType)
    : null;
}

export async function loadDiplomaticRelations(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<DiplomaticRelationship[]> {
  const buffer = await listDiplomaticRelationsArrow(db, nationIdxs);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();
  const relationships: DiplomaticRelationship[] = [];
  for (const row of rows) {
    const r = row.toJSON();
    const relationType = asRelationType(r.relation_type);
    if (
      typeof r.first_nation_idx !== "number" ||
      typeof r.second_nation_idx !== "number" ||
      relationType === null
    ) {
      continue;
    }
    relationships.push({
      firstNationIdx: r.first_nation_idx,
      secondNationIdx: r.second_nation_idx,
      relationType,
      startDate: typeof r.start_date === "string" ? r.start_date : null,
      amount: typeof r.amount === "number" ? r.amount : null,
      isOneWay: Number(r.is_one_way) === 1,
    });
  }
  return relationships;
}

export async function loadRelationTrust(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationRelationTrust[]> {
  const buffer = await listRelationTrustArrow(db, nationIdxs);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();
  return rows.map((row) => {
    const r = row.toJSON();
    return {
      ownerNationIdx: Number(r.owner_nation_idx),
      targetNationIdx: Number(r.target_nation_idx),
      trust: Number(r.trust),
      opinionScore: typeof r.opinion_score === "number" ? r.opinion_score : null,
    };
  });
}

// research.md §3 (Constitution Principle VI): color is never the sole
// distinguishing signal for relationship type — each type also gets its
// own line-dash pattern, applied identically to chords and to the
// filter checkboxes' legend swatches (contracts/ui.md).
export type ChordDashPattern = "solid" | "dashed" | "dotted" | number[];

export interface RelationTypeStyle {
  color: string;
  dashPattern: ChordDashPattern;
  label: string;
}

export const RELATION_TYPE_LEGEND: Record<RelationType, RelationTypeStyle> = {
  alliance: { color: "#2f6fed", dashPattern: "solid", label: "Alliance" },
  rivalry: { color: "#d64545", dashPattern: "dashed", label: "Rivalry" },
  royal_marriage: { color: "#c9a227", dashPattern: "dotted", label: "Royal Marriage" },
  guarantee: { color: "#3f9142", dashPattern: [8, 4, 1, 4], label: "Guarantee" },
  military_access: { color: "#7b3fa0", dashPattern: [2, 2], label: "Military Access" },
  food_access: { color: "#1a8f8f", dashPattern: [10, 3], label: "Food Access" },
  fleet_basing_rights: { color: "#8a5a2e", dashPattern: [1, 3, 1, 3, 6, 3], label: "Fleet Basing Rights" },
  economic_support: { color: "#c23b8f", dashPattern: [12, 3, 3, 3], label: "Economic Support" },
};

// spec Assumptions: a relationship type with no trust-ledger entry for
// either direction of a pair falls back to this uniform mid-scale
// thickness, on the same 0-100-ish scale real `trust` values use, rather
// than collapsing to 0 (which would misread as "no relationship" instead
// of "no score data").
const FALLBACK_THICKNESS_SCORE = 50;

export interface ChordArc {
  nationIdx: number;
  tag: string;
  name: string | null;
  colorR: number;
  colorG: number;
  colorB: number;
  relationshipCount: number;
}

export interface ChordEdge {
  firstNationIdx: number;
  secondNationIdx: number;
  relationType: RelationType;
  startDate: string | null;
  /** Always populated — `score` when a real trust value was found, the
   * fallback constant otherwise. For visual (line width) scaling only;
   * never render this number directly (use `score`, which is `null`
   * exactly when this is the fallback — constitution Principle IV: a
   * fabricated stand-in must never be presented as if it were real). */
  thickness: number;
  /** The real, directional-or-averaged trust score for this pair, or
   * `null` when no `nation_relation_trust` row existed for either
   * direction (spec FR-010's "uniform thickness" fallback case). Only
   * this field, never `thickness`, is safe to show as a displayed
   * number (spec FR-006's tooltip). */
  score: number | null;
  /** Derived "Opinion" score (-200..200-ish), directional-or-averaged
   * the same way as `score` — `null` when neither direction recorded
   * any timed bias for this pair. Display-only, no fallback constant
   * (nothing visual is scaled by it). */
  opinionScore: number | null;
  /** Ducat amount, only for `relationType === "economic_support"`. */
  amount: number | null;
  /** See `DiplomaticRelationship.isOneWay` — direction, where true,
   * runs `firstNationIdx -> secondNationIdx`. */
  isOneWay: boolean;
}

export interface ChordViewModel {
  arcs: ChordArc[];
  edges: ChordEdge[];
}

function buildTrustIndex(trust: readonly NationRelationTrust[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const t of trust) index.set(`${t.ownerNationIdx}:${t.targetNationIdx}`, t.trust);
  return index;
}

function buildOpinionIndex(trust: readonly NationRelationTrust[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const t of trust) {
    if (t.opinionScore !== null) index.set(`${t.ownerNationIdx}:${t.targetNationIdx}`, t.opinionScore);
  }
  return index;
}

/** Same directional-or-averaged rule as `trustForPair`, but with no
 * fallback constant — `null` genuinely means "no data," and nothing
 * visual is scaled by this value, so there's no need to paper over the
 * missing case. */
function opinionForPair(opinionIndex: Map<string, number>, first: number, second: number): number | null {
  const forward = opinionIndex.get(`${first}:${second}`);
  const backward = opinionIndex.get(`${second}:${first}`);
  if (forward !== undefined && backward !== undefined) return (forward + backward) / 2;
  if (forward !== undefined) return forward;
  if (backward !== undefined) return backward;
  return null;
}

/** spec FR-010/Assumptions: average when both directions have a trust
 * value, use whichever direction has one when only one does, fall back
 * to a uniform constant (never displayed as a real number) when neither
 * does — trust stays directional in storage (data-model.md) specifically
 * so this distinction is still knowable here, at the point that needs
 * it. */
function trustForPair(
  trustIndex: Map<string, number>,
  first: number,
  second: number,
): { thickness: number; score: number | null } {
  const forward = trustIndex.get(`${first}:${second}`);
  const backward = trustIndex.get(`${second}:${first}`);
  let score: number | null = null;
  if (forward !== undefined && backward !== undefined) score = (forward + backward) / 2;
  else if (forward !== undefined) score = forward;
  else if (backward !== undefined) score = backward;
  return { thickness: score ?? FALLBACK_THICKNESS_SCORE, score };
}

/** Builds the chord diagram's arcs/edges from already-decoded rows —
 * spec FR-001 (an arc per country with >=1 visible relationship),
 * FR-003 (country color, `NEUTRAL_COLOR` fallback per this app's
 * existing map-layer convention), FR-004 (one edge per relationship
 * instance — a pair with 2 simultaneous types produces 2 edges, never
 * merged), FR-008 (no isolated chord-less arcs), FR-010 (thickness),
 * FR-011 (arc order: relationship count descending, no geographic
 * grouping — research.md, no region data exists in this codebase).
 * `relationships` should already be filtered to the currently-visible
 * relationship types (User Story 2) before being passed in here. */
export function buildChordViewModel(
  countries: readonly DiplomacyCountry[],
  relationships: readonly DiplomaticRelationship[],
  trust: readonly NationRelationTrust[],
): ChordViewModel {
  const trustIndex = buildTrustIndex(trust);
  const opinionIndex = buildOpinionIndex(trust);
  const countryByIdx = new Map(countries.map((c) => [c.idx, c]));

  // spec Edge Cases: a relationship referencing a tag no longer in
  // `nations` (released/annexed since it was recorded) is data noise —
  // skip that chord rather than rendering a broken arc endpoint.
  const validRelationships = relationships.filter(
    (r) => countryByIdx.has(r.firstNationIdx) && countryByIdx.has(r.secondNationIdx),
  );

  const relationshipCountByIdx = new Map<number, number>();
  for (const rel of validRelationships) {
    relationshipCountByIdx.set(
      rel.firstNationIdx,
      (relationshipCountByIdx.get(rel.firstNationIdx) ?? 0) + 1,
    );
    relationshipCountByIdx.set(
      rel.secondNationIdx,
      (relationshipCountByIdx.get(rel.secondNationIdx) ?? 0) + 1,
    );
  }

  const arcs: ChordArc[] = Array.from(relationshipCountByIdx.entries())
    .map(([nationIdx, relationshipCount]) => {
      // Safe: nationIdx came from validRelationships, already filtered
      // to pairs where both endpoints exist in countryByIdx.
      const country = countryByIdx.get(nationIdx)!;
      return {
        nationIdx,
        tag: country.tag,
        name: country.name,
        colorR: country.color?.[0] ?? NEUTRAL_COLOR[0],
        colorG: country.color?.[1] ?? NEUTRAL_COLOR[1],
        colorB: country.color?.[2] ?? NEUTRAL_COLOR[2],
        relationshipCount,
      };
    })
    .sort((a, b) => b.relationshipCount - a.relationshipCount || a.tag.localeCompare(b.tag));

  const edges: ChordEdge[] = validRelationships.map((rel) => {
    const { thickness, score } = trustForPair(trustIndex, rel.firstNationIdx, rel.secondNationIdx);
    const opinionScore = opinionForPair(opinionIndex, rel.firstNationIdx, rel.secondNationIdx);
    return {
      firstNationIdx: rel.firstNationIdx,
      secondNationIdx: rel.secondNationIdx,
      relationType: rel.relationType,
      startDate: rel.startDate,
      thickness,
      score,
      opinionScore,
      amount: rel.amount,
      isOneWay: rel.isOneWay,
    };
  });

  return { arcs, edges };
}

/** spec FR-007: independent show/hide per relationship type. */
export function filterByRelationType(
  relationships: readonly DiplomaticRelationship[],
  visibleTypes: ReadonlySet<RelationType>,
): DiplomaticRelationship[] {
  return relationships.filter((r) => visibleTypes.has(r.relationType));
}

/** Re-exported so `DiplomacyTab.tsx` has one import surface for country
 * identity/color/name, and for the same default-selection helper
 * Leaderboard/World Goods/Societal Compass already use. */
export { computeDefaultSelection, loadLeaderboardCountries, RELATION_TYPES };
export type { LeaderboardCountry };
