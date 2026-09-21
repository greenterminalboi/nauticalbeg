# Contract: UI wiring

## Tab identity

- `src/components/Overview/tabs.ts`: add `"societal-compass"` to the
  `EncyclopediaTab` union (currently `"countries" | "wars" | "leaderboard" |
  "characters" | "markets"`).
- `src/components/Overview/EncyclopediaNav.tsx`: add `{ id: "societal-compass",
  label: "Societal Compass" }` to the `TABS` array.
- `src/components/Overview/FileLoader.tsx`: add `isSocietalCompassTab =
  encyclopediaTab === "societal-compass"`, include it in the existing
  wide-layout condition (~line 416), and add a render branch next to the
  existing `LeaderboardTab`/`MarketsTab` branches (~lines 486-502):
  `{isFactbook && isSocietalCompassTab && <SocietalCompassPage db={readDbRef.current} .../>}`.

## Component props

> Post-ship correction (spec addendum points 4 & 7): `isGreatPower` and
> the `"great-power"` color mode were removed; `colorRgb` (the
> country's real map color) was added as the default color source.

```ts
// src/components/Overview/SocietalCompassChart.tsx
interface SocietalCompassChartProps {
  points: Array<{
    nationIdx: number;
    tag: string;
    name: string;
    x: number;
    y: number;
    axisCount: number; // 0 => no-data country, excluded or specially marked (FR-015)
    sizeValue: number; // already resolved by the caller's chosen size metric
    colorRgb: [number, number, number] | null; // the country's real map color
    colorAxisValue: number | null; // present only in "color by axis" mode
    axisBreakdown: Array<{ axis: string; label: string; normalizedValue: number }>;
  }>;
  colorMode: "country" | "axis";
  colorAxisLabel?: string; // required when colorMode === "axis"
}
```

`SocietalCompassChart` never fetches or computes positions itself — it only
renders pre-computed points. Position computation (vector sum, mean-vector
normalization, sentinel filtering) lives in a plain function/hook consumed
by `SocietalCompassPage`, not in the chart component, so it stays testable
without ECharts.

## Default selection and axis-end labels (spec addendum points 2 & 5)

`SocietalCompassPage` seeds its selection with `computeDefaultSelection`
(`leaderboardData.ts` — the player's human-played country/countries, or a
small fallback) and lets the user add/remove countries via `AddCountryInput`
(the same components `LeaderboardTab`/`WorldGoodsPage` already use), rather
than defaulting to every country in the save. `SocietalCompassChart`'s
quadrant reference is four axis-end text labels (top/bottom/left/right),
each naming the two dominant Societal Value axes for that direction, not
four diagonal corner names.
