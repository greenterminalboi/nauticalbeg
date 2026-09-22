# Contract: UI wiring

## Tab identity

- `src/components/Overview/tabs.ts`: add `"diplomatic-relations"` to the
  `EncyclopediaTab` union (currently `"countries" | "wars" | "leaderboard" |
  "characters" | "markets" | "societal-compass" | "firepower"`). **Not**
  the existing per-nation `"diplomacy"` `TabId` — that's a different,
  still-unbuilt feature (Countries sub-tab's own single-nation diplomacy
  category, same distinction 012-firepower-tab's contract already drew
  between its new `EncyclopediaTab` and the unrelated per-nation
  `"military"` `TabId`) and stays untouched.
- Factbook side nav (wherever `firepower`'s `{ id: "firepower", label:
  "Firepower" }` entry lives): add `{ id: "diplomatic-relations", label:
  "Diplomacy" }`.
- `src/components/Overview/FileLoader.tsx`: add
  `isDiplomaticRelationsTab = isFactbook && encyclopediaTab ===
  "diplomatic-relations" && isReady && !!readDbRef.current`, include it in
  the existing wide-layout condition alongside `isFirepowerTab`, add a
  render branch:
  `{isFactbook && encyclopediaTab === "diplomatic-relations" && (<DiplomacyTab db={readDbRef.current} />)}`.

## Component structure

**Amendment (course-corrected mid-implementation, explicit user request)**:
`showAll`/`onToggleShowAll` (a "major powers by development" ranking) never
shipped — replaced by `selectedIdxs`/`onToggleCountry`, the exact same
default-selection/`AddCountryInput` pattern Leaderboard/World Goods/Societal
Compass already use (human-played countries by default). The shapes below
are as actually built, not as originally planned.

```ts
// src/components/Overview/DiplomacyTab.tsx
// Owns: country selection (selectedIdxs, defaulted via computeDefaultSelection
// on load — spec FR-009), relationship-type filter state (alliance/rivalry/
// royal_marriage/guarantee, all on by default — spec FR-007), Hugbox
// Detection toggle (default off, spec FR-013). Fetches via
// listDiplomaticRelationsArrow/listRelationTrustArrow/loadLeaderboardCountries
// once on mount, filtering/clustering happen client-side on every toggle
// change — no re-fetch (SC-003).
interface DiplomacyTabProps {
  db: SaveDatabase;
}

// src/components/Overview/DiplomacyFilters.tsx
interface DiplomacyFiltersProps {
  countries: readonly DiplomacyCountry[];
  selectedIdxs: readonly number[];
  onToggleCountry: (idx: number) => void;
  visibleTypes: ReadonlySet<RelationType>;
  onToggleType: (type: RelationType) => void;
  hugboxEnabled: boolean;
  onToggleHugbox: () => void;
}

// src/components/Overview/DiplomacyChordChart.tsx
// echarts graph+custom dual series (research.md §2), useEChartsInstance
// precedent. Arc ordering: relationship-count descending (FR-011) by
// default, overridden by hugboxClustering.ts's cluster-adjacent ordering
// while Hugbox Detection is enabled (FR-016/FR-017). Each arc is labeled
// with the country's tag, rotated radially (flipped on the circle's left
// half so it reads left-to-right, not upside down — explicit user request).
interface DiplomacyChordChartProps {
  arcs: readonly ChordArc[];   // already filtered to the current selection/relationship-type filters
  edges: readonly ChordEdge[]; // one per visible relationship instance (FR-004: 2 simultaneous types = 2 edges)
  hugboxClusters: readonly HugboxCluster[] | null; // null when Hugbox Detection is off
}
```

**Amendment (post-ship, 2026-09-22, explicit user requests)**: `ChordEdge`
gained `opinionScore`, `amount`, `isOneWay` (data-model.md's
`diplomatic_relations`/`nation_relation_trust` amendments). Chart-visible
consequences:

- **Directional arrowheads**: a one-way edge (`isOneWay: true` — every type
  except `alliance`/`royal_marriage`/`rivalry`) renders an arrowhead at the
  target end (`second_nation_idx`); a symmetric edge renders none. Drawn via
  the underlying `graph` series' per-edge `symbol`/`symbolSize`, not the
  `custom` chord-path series.
- **Tooltip additions**: hovering a chord now also shows, when present,
  `Opinion: <opinionScore>` (the `nation_relation_trust` derived sum, not
  scaled/clamped to the in-game ±200 display range — disclosed as derived
  per Constitution Principle IV) and `Economic support: <amount> ducats`
  (only for `relation_type = 'economic_support'` rows — `amount` is NULL for
  every other type, so the line is omitted rather than showing a fabricated
  0).
- **Hugbox Detection**: the alliance-clique pair filter now also admits
  `relation_type = 'economic_support'` rows (user: "economic support is
  treated the same as an alliance") — done entirely in `DiplomacyTab.tsx`'s
  caller-side filter, `hugboxClustering.ts` itself is unchanged (still takes
  an arbitrary pair list).

## Z-order (explicit user request, post-ship bug fix, 2026-09-22)

"lines should never ever go behind nodes" / debug image `specs/debug_images/
fix this.png` (chords rendering underneath node circles). Two related fixes,
both in `DiplomacyChordChart.tsx`:

- **Paint order**: the `graph` series (chords) is on `zlevel: 0`; both the
  node-circle `custom` series and the Hugbox boundary `custom` series are on
  `zlevel: 1` — a separate zrender paint layer that always composites above
  `zlevel: 0`, so nodes stay on top even during hover/emphasis restyling
  (`zlevel` orders independent paint layers; the unrelated `z` property only
  orders elements *within* one layer and was insufficient here).
- **Shared geometry**: the `custom` series' `renderItem` callbacks and the
  `graph` series' node coordinates must agree on the exact same ellipse/
  circle math. Previously they didn't — `renderItem` re-measured
  `api.getWidth()/getHeight()` internally (echarts' own live measurement)
  while node coordinates came from React's separately-`ResizeObserver`'d
  `size` state, two independent measurements that could disagree by a pixel
  or more, producing the "chord ends under the node instead of at its
  center" artifact in the debug image. Fixed by computing `geometry` once
  per option build (outer `useMemo`) and closing over that single object in
  every `renderItem` call, so there is exactly one source of truth for
  where a node's circle actually is.

## Empty state

Reuses the existing `EmptyState` component (`src/components/Overview/
EmptyState.tsx`, same one `WarsTab`/`RulerHistoryChart` already use) for
FR-012's zero-visible-relationships case — no new empty-state component.

## Layout (explicit user request, course-corrected mid-implementation)

`DiplomacyChordChart.tsx` originally drew each country as a contiguous arc
band tiled around a circle (a literal "chord diagram"). Replaced with: an
**ellipse** sized from the canvas's actual width/height independently (not
capped to the shorter dimension) so the diagram uses the full available
canvas rather than a fixed circular fraction of it; each country is a
**circle** node (not an arc band) placed at its angular position on that
ellipse, radius shrinking as country count grows (never below legible); a
sampled `polyline` approximates the elliptical arc for Hugbox cluster
boundary brackets, since zrender has no elliptical-arc-segment shape.

## Legend and colorblind-safety (research.md §3)

`DiplomacyFilters.tsx`'s filter checkboxes double as the legend: each
relationship type's swatch renders its fixed color *and* its line-dash
pattern (solid/dashed/dotted/dash-dot), matching exactly what
`DiplomacyChordChart.tsx` applies to that type's chords — never color alone.
