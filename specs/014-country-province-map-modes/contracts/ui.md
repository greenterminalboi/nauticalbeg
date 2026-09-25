# Contract: Map layers & sidebar (014)

## `src/components/Overview/mapLayers.ts`

- `MapLayer` gains a required `grain: "location" | "province" | "country"`. All 12 existing layers get `"location"`.
- New helper `groupedRankSpectralLayer({ id, label, grain, groupLabel, getGroupKey, getGroupName, getValue, formatValue?, negativeAs? })`:
  - Ranks **distinct group keys** with value > 0 once per dataset, memoized in a `WeakMap<MapLocationDataset, …>` like every other per-dataset cache in this file (research.md §4).
  - Fill rules:
    - `null` → NEUTRAL
    - `0` → ZERO
    - `< 0` → `DEBT_COLOR` when `negativeAs: "debt"` (Treasury only)
    - otherwise `spectralColor(rank)`
  - The existing location-grain `rankSpectralLayer` becomes a thin wrapper that uses `row.name` as its group key and keeps behaving exactly as before, which the existing `mapLayers.test.ts` must still show.
  - `getHeight` (the experimental extrusion) returns the same group rank.
- `countryStability`: a fixed diverging scale with `t = (stability + 100) / 200`, purple → cream → orange (research.md §5). Its legend is −100 / −50 / 0 / +50 / +100 swatches plus "No data".
- `governmentType`: a fixed color table for the 5 known types, with golden-angle fallback for unknown ones. The legend lists only the types present in the dataset, sorted.
- Tooltip fields:
  - Country layers: `Location`, `Owner`, `<metric>`.
  - Province layers: `Location`, `Province`, `<metric>`.
  - Formatting: Stability to 1 dp with a sign; Literacy as `x.y%`; counts as integers; the rest `toLocaleString`, max 1 dp.
  - FR-016: the tooltip is the existing HoverTooltip-style panel in MapTab, never `title=`.
- Registration order is Location (existing 12, unchanged), then Province (Development, Tax Base, Soldiers, Population), then Country (Treasury, Stability, Government Type, Population, Economical Base, Literacy, Tech Advances, Works of Art).

## `src/components/Overview/MapSidebar.tsx`

- Groups `layers` by `grain` into three `<section>`s headed Location / Province / Country, in that order. Empty groups are not rendered.
- Each section header is a native `<button aria-expanded>` that toggles only that section (local `useState`, default all expanded).
- Collapsing a section that contains the active layer hides its button but does **not** change `activeLayerId` (acceptance scenario 1.2).
- The existing outer collapse toggle, the `aria-current="page"` active marker and the `onSelectLayer` contract are unchanged.
- Tests (`tests/components/MapSidebar.test.tsx`):
  - three headings render
  - collapsing Province hides only Province items
  - the active layer stays active through a collapse
  - clicking a Country item calls `onSelectLayer` with its id

## `MapTab.tsx` / `MapCanvas.tsx`

Nothing changes in either file beyond what the new `MapLocationRow` fields flow through. Layer switching is still a pure prop change (FR-021, SC-001).
