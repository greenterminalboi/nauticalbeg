# Contract: UI wiring

## Tab identity

- `src/components/Overview/tabs.ts`: add `"firepower"` to the
  `EncyclopediaTab` union (currently `"countries" | "wars" | "leaderboard"
  | "characters" | "markets" | "societal-compass"`). **Not** the existing
  per-nation `"military"` `TabId` — that's a different, still-unbuilt
  feature (Countries sub-tab's own category list) and stays untouched
  (plan.md's Structure Decision).
- `src/components/Overview/EncyclopediaNav.tsx`-equivalent nav list: add
  `{ id: "firepower", label: "Firepower" }`.
- `src/components/Overview/FileLoader.tsx`: add
  `isFirepowerTab = encyclopediaTab === "firepower"`, include it in the
  existing wide-layout condition, add a render branch next to
  `SocietalCompassPage`/`MarketsTab`:
  `{isFactbook && isFirepowerTab && <FirepowerTab db={readDbRef.current} .../>}`.

## Sub-tab navigation

`FirepowerTab` owns a `activeSubTab: "doctrine" | "army" | "navy"` piece
of state (mirrors `MarketsTab`'s internal sub-nav pattern, not a new
top-level `AppSection`/`EncyclopediaTab` per sub-view) and renders
`FirepowerSideNav` + the active sub-view.

## Component props

```ts
// src/components/Overview/MilitaryDoctrineChart.tsx
// Reuses SocietalCompassChart's point shape filtered to the 3 military
// axes; a 3-spoke radar rather than a 2D scatter (different rendering,
// same underlying per-axis reading shape as SocietalCompassChart's
// axisBreakdown).
interface MilitaryDoctrineChartProps {
  points: Array<{
    nationIdx: number;
    tag: string;
    name: string;
    colorRgb: [number, number, number] | null;
    axes: Array<{ axis: "land_vs_naval" | "offensive_vs_defensive" | "quality_vs_quantity"; value: number | null }>; // null = not applicable (-999 sentinel), never 0
  }>;
}

// src/components/Overview/ArmyStatsTable.tsx
interface ArmyStatSummary {
  nationIdx: number;
  tag: string;
  name: string;
  morale: number; // count-weighted mean of fielded regiments' own morale
  discipline: PartialStat;
  tactics: PartialStat;
  manpower: number;
  regimentCount: number;
  monthlyManpower: number;
  armyMaintenanceCost: number;
  levySize: number;
  regularsSize: number;
  fortLimit: PartialStat;
  siegeAbility: PartialStat;
  fortDefense: PartialStat; // internal keyword global_defensive — label stays "Fort Defense"
  armyTradition: number;
  ageArtillery: 1 | 2 | 3 | 4 | 5 | 6;
  ageInfantry: 1 | 2 | 3 | 4 | 5 | 6;
  ageCavalry: 1 | 2 | 3 | 4 | 5 | 6;
  ageSupply: 1 | 2 | 3 | 4 | 5 | 6;
}
// `PartialStat = { value: number; isPartial: true }` — every computed-stat
// column (spec FR-013) carries this shape so the table can render its
// "partial total" marker without a separate lookup; never a bare number.
interface ArmyStatsTableProps {
  rows: ArmyStatSummary[];
}

// src/components/Overview/NavyStatsTable.tsx
interface NavyStatSummary {
  nationIdx: number;
  tag: string;
  name: string;
  damageGiven: number | null; // null only if research.md §8's source genuinely has no wars for this country yet — not the FR-010 fallback (a real source was confirmed and IS implemented)
  damageTaken: number | null;
  sailors: number;
  shipLevies: number;
  shipRegulars: number;
  heavyShipCount: number;
  lightShipCount: number;
  transportCount: number;
  galleyCount: number;
  navyTradition: number;
  monthlySailors: number;
  ageHeavies: 1 | 2 | 3 | 4 | 5 | 6;
  ageTransports: 1 | 2 | 3 | 4 | 5 | 6;
  ageLights: 1 | 2 | 3 | 4 | 5 | 6;
  ageGalleys: 1 | 2 | 3 | 4 | 5 | 6;
}
interface NavyStatsTableProps {
  rows: NavyStatSummary[];
}
```

Both tables render the four age columns as roman numerals (I-VI) via a
small, shared `toRomanAge(n: 1|2|3|4|5|6): string` helper — display
formatting only, never stored as roman text.

## Default selection

`FirepowerTab` seeds its country selection with `computeDefaultSelection`
and `AddCountryInput`, the same convention `LeaderboardTab`/`MarketsTab`/
`SocietalCompassPage` already use (spec Assumptions) — not every country
in the save by default.

## Zero-army / zero-navy countries (spec FR-012)

A selected country with zero rows in `regiments` for the relevant prefix
is omitted from `ArmyStatsTable`/`NavyStatsTable`'s `rows` entirely by the
service layer (`armyNavyStats.ts`, `contracts/queries.md`) — the
component itself never receives a row it would need to zero-fill or
special-case.
