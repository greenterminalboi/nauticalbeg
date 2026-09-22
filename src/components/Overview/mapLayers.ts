// specs/005-map-visualization: the four map modes (spec Key Entities:
// Map Layer). Each user story appends exactly one entry to MAP_LAYERS —
// this file has no layer-specific logic of its own beyond the shared
// type and the neutral "no data" fill every layer falls back to
// (spec FR-009).
import type { MapLocationDataset, MapLocationRow } from "./mapLocationData";
import { RGO_GAME_COLORS } from "./rgoGameColors";
import { LOCATION_TERRAIN } from "./locationTerrain";

/** Shared "unowned / no confirmed data" fill (spec Edge Cases,
 * FR-009) — a light, desaturated gray, distinguishable from any
 * plausible in-game country color without relying on hue alone
 * (constitution Principle VI: every layer also carries a text
 * label/tooltip, never color as the only signal). */
export const NEUTRAL_COLOR: [number, number, number] = [200, 200, 200];

/** user request 2026-09-22: a confirmed value of exactly 0 (e.g. a
 * location with genuinely zero development) is a different fact than
 * "no data" (the field is null) — NEUTRAL_COLOR above must mean only the
 * latter, so a location known to be at zero doesn't visually read the
 * same as one this project never got a reading for at all. Dark
 * charcoal: distinct from both NEUTRAL_COLOR's light gray and
 * SPECTRAL_STOPS' purple low end, so "zero" isn't mistaken for "lowest
 * nonzero" either. */
export const ZERO_COLOR: [number, number, number] = [58, 58, 58];

export interface LegendEntry {
  color: [number, number, number];
  label: string;
}

export interface TooltipField {
  label: string;
  value: string;
}

export interface MapLayer {
  id: string;
  label: string;
  /** `dataset` is the same object every call within one save's session
   * (research.md §7) — a layer that needs cross-row context (a min/max
   * for a shading scale, a per-save color assignment) should memoize
   * against that reference (e.g. a `WeakMap<MapLocationDataset, ...>`,
   * as the population/RGO layers do) rather than recomputing it per row;
   * `getFill` runs once per visible location every redraw. */
  getFill(row: MapLocationRow, dataset: MapLocationDataset): [number, number, number];
  getTooltipFields(row: MapLocationRow): TooltipField[];
  getLegend(dataset: MapLocationDataset): LegendEntry[];
  /** EXPERIMENTAL (prototype, unshipped): 0..1 "how tall" this location
   * should read on the pseudo-3D extrusion effect MapCanvas draws for
   * layers that opt in, normally the same normalized value each layer
   * already computes for its own color gradient (so height and color
   * intensity agree — a location never reads "short but hot-colored").
   * Omitted entirely by every categorical/ownership layer (Political,
   * Terrain, Culture, ...), for which "height" has no meaning. */
  getHeight?(row: MapLocationRow, dataset: MapLocationDataset): number;
}

/** Registry of available layers, in sidebar display order. Starts empty
 * — Foundational wires the plumbing every layer needs, but no layer is
 * selectable until User Story 1 registers the first one. */
export const MAP_LAYERS: MapLayer[] = [];

// --- User Story 1: Political ------------------------------------------

const politicalLayer: MapLayer = {
  id: "political",
  label: "Political",
  getFill(row) {
    // Owner color alone determines fill — no cross-row context needed.
    return row.ownerColor ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Owner", value: row.ownerName },
    ];
  },
  getLegend() {
    return [{ color: NEUTRAL_COLOR, label: "No confirmed owner/color" }];
  },
};
MAP_LAYERS.push(politicalLayer);

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// user request 2026-09-22: a wider, more differentiable heat gradient for
// Population/Development/Tax Base than a single low/high color pair —
// purple (lowest) through blue, green, light green, yellow, orange, to
// red (highest), the classic "cold to hot" spectral order so red reads
// as "hottest" regardless of which of these three layers is active.
const SPECTRAL_STOPS: Array<[number, number, number]> = [
  [126, 47, 142], // purple
  [49, 104, 196], // blue
  [26, 152, 80], // green
  [145, 207, 96], // light green
  [255, 224, 96], // yellow
  [253, 141, 60], // orange
  [215, 48, 39], // red
];
const SPECTRAL_LABELS = ["Lowest", "Low", "Below average", "Average", "Above average", "High", "Highest"];

function spectralColor(t: number): [number, number, number] {
  const scaled = clamp01(t) * (SPECTRAL_STOPS.length - 1);
  const i = Math.min(SPECTRAL_STOPS.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const a = SPECTRAL_STOPS[i];
  const b = SPECTRAL_STOPS[i + 1];
  return [lerp(a[0], b[0], localT), lerp(a[1], b[1], localT), lerp(a[2], b[2], localT)];
}

// Percentile rank, not raw-value normalization (log or linear): every
// location lands an even 1/(N-1) apart on the gradient regardless of how
// skewed the real values are, so two adjacent locations are always
// visually distinguishable — the same fix Development's percentile rank
// already applied below, generalized here so Population/Tax Base share it
// (spectralColor's 7 stops need an even spread to read correctly; a
// skewed log/linear scale would still bunch most locations in one or two
// stops). Memoized per dataset reference, same pattern as every other
// per-dataset cache in this file.
function rankSpectralLayer(
  id: string,
  label: string,
  tooltipLabel: string,
  getValue: (row: MapLocationRow) => number | null,
): MapLayer {
  const rankCache = new WeakMap<MapLocationDataset, Map<string, number>>();
  function getRanks(dataset: MapLocationDataset): Map<string, number> {
    const cached = rankCache.get(dataset);
    if (cached) return cached;
    const withValue = Array.from(dataset.values()).filter((row) => {
      const value = getValue(row);
      return value !== null && value > 0;
    });
    withValue.sort((a, b) => getValue(a)! - getValue(b)!);
    const ranks = new Map<string, number>();
    withValue.forEach((row, i) => {
      ranks.set(row.name, withValue.length > 1 ? i / (withValue.length - 1) : 1);
    });
    rankCache.set(dataset, ranks);
    return ranks;
  }

  return {
    id,
    label,
    getFill(row, dataset) {
      // Confirmed zero (getRanks' own >0 filter excludes it, same as
      // null) reads as ZERO_COLOR, not NEUTRAL_COLOR — "we know this
      // location is at zero" is a different fact than "no data" (see
      // ZERO_COLOR's doc comment).
      if (getValue(row) === 0) return ZERO_COLOR;
      const t = getRanks(dataset).get(row.name);
      return t === undefined ? NEUTRAL_COLOR : spectralColor(t);
    },
    getHeight(row, dataset) {
      // EXPERIMENTAL (prototype, unshipped): extrusion height agrees with
      // the same rank the fill color uses (MapCanvas's own doc comment).
      return getRanks(dataset).get(row.name) ?? 0;
    },
    getTooltipFields(row) {
      const value = getValue(row);
      return [
        { label: "Location", value: row.name },
        {
          label: tooltipLabel,
          value: value === null ? "No data" : value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
        },
      ];
    },
    getLegend() {
      return [
        { color: NEUTRAL_COLOR, label: "No data" },
        { color: ZERO_COLOR, label: "Zero" },
        ...SPECTRAL_STOPS.map((color, i) => ({ color, label: SPECTRAL_LABELS[i] })),
      ];
    },
  };
}

// --- User Story 3: Location Population ---------------------------------

// user request 2026-09-22: `totalPopulation` (mapLocationData.ts) comes
// from a `COALESCE(..., 0)` query, so it can never be null by itself —
// unlike `development`, which stays null wherever this project has no
// confirmed reading for a location (water, or a location this save
// simply never populated data for). Per the user's own rule: wherever
// development has no data, population is treated the same way (null,
// not a bare 0) rather than trusting the COALESCE default — a location
// this project can't confirm anything about shouldn't read as a
// confirmed zero.
const populationLayer = rankSpectralLayer(
  "population",
  "Location Population",
  "Population",
  (row) => (row.development === null ? null : row.totalPopulation),
);
MAP_LAYERS.push(populationLayer);

// --- User Story 4: RGO (Raw Goods) --------------------------------------

const RGO_SATURATION = 0.65;
const RGO_LIGHTNESS = 0.5;
const GOLDEN_ANGLE_DEG = 137.508;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = l - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (hPrime < 1) [r1, g1, b1] = [c, x, 0];
  else if (hPrime < 2) [r1, g1, b1] = [x, c, 0];
  else if (hPrime < 3) [r1, g1, b1] = [0, c, x];
  else if (hPrime < 4) [r1, g1, b1] = [0, x, c];
  else if (hPrime < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/** Memoized per dataset reference (see the MapLayer interface's doc
 * comment). Colors come from RGO_GAME_COLORS (the game's own RGO colors,
 * per rgoGameColors.ts's doc comment) whenever a raw good is in that
 * table — which is every raw good this project has confirmed a real save
 * can produce. A raw good NOT in the table (a future game version adding
 * one this table hasn't been regenerated for) still gets a color rather
 * than silently falling back to the neutral "no data" style — a stable
 * golden-angle hue, assigned in the order that unknown good is first
 * encountered while scanning the dataset, clearly a fallback rather than
 * the primary path now. */
const rgoColorCache = new WeakMap<MapLocationDataset, Map<string, [number, number, number]>>();
function getRgoColorMap(dataset: MapLocationDataset): Map<string, [number, number, number]> {
  const cached = rgoColorCache.get(dataset);
  if (cached) return cached;
  const colors = new Map<string, [number, number, number]>();
  let fallbackIndex = 0;
  for (const row of dataset.values()) {
    if (row.rawMaterial === null || colors.has(row.rawMaterial)) continue;
    const gameColor = RGO_GAME_COLORS[row.rawMaterial];
    if (gameColor) {
      colors.set(row.rawMaterial, gameColor);
    } else {
      colors.set(row.rawMaterial, hslToRgb(fallbackIndex * GOLDEN_ANGLE_DEG, RGO_SATURATION, RGO_LIGHTNESS));
      fallbackIndex += 1;
    }
  }
  rgoColorCache.set(dataset, colors);
  return colors;
}

const rgoLayer: MapLayer = {
  id: "rgo",
  label: "RGO",
  getFill(row, dataset) {
    if (row.rawMaterial === null) return NEUTRAL_COLOR;
    return getRgoColorMap(dataset).get(row.rawMaterial) ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Raw Good", value: row.rawMaterial ?? "None" },
    ];
  },
  getLegend(dataset) {
    const entries = Array.from(getRgoColorMap(dataset), ([label, color]) => ({ color, label }));
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  },
};
MAP_LAYERS.push(rgoLayer);

// --- User Story 5: Control -----------------------------------------------

const controlLayer: MapLayer = {
  id: "control",
  label: "Control",
  getFill(row) {
    if (row.controllerColor === null) return NEUTRAL_COLOR;
    // A missing `control` value (present for most, not all, locations —
    // research.md §5) is treated as full strength, not faded: fading it
    // would fabricate a "low control" reading the save never recorded
    // (constitution Principle IV), and this layer's identity signal is
    // the controller, which IS confirmed here.
    const strength = row.control === null ? 1 : clamp01(row.control);
    return [
      lerp(NEUTRAL_COLOR[0], row.controllerColor[0], strength),
      lerp(NEUTRAL_COLOR[1], row.controllerColor[1], strength),
      lerp(NEUTRAL_COLOR[2], row.controllerColor[2], strength),
    ];
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Controller", value: row.controllerName },
      {
        label: "Control",
        value: row.control === null ? "Unknown" : `${Math.round(row.control * 100)}%`,
      },
    ];
  },
  getLegend() {
    // Full-control color varies per country (the controller's own color,
    // same as Political) — nothing fixed to swatch there, matching how
    // politicalLayer's own legend only shows its neutral entry for the
    // same reason. Control level itself is stated per-location in the
    // tooltip (percentage), not approximated by a legend gradient.
    return [{ color: NEUTRAL_COLOR, label: "No controller / no data" }];
  },
};
MAP_LAYERS.push(controlLayer);

// --- specs/011-atlas-map-modes: shared numeric-layer helper -------------

/** Log-normalized, per-dataset-`WeakMap`-memoized gradient shading — the
 * same approach `populationLayer` above already uses (research.md §4 of
 * that feature: a perceptual, not raw-linear, scale so one outlier
 * location doesn't wash out the rest). Factored out here for reuse by
 * Development/Tax Base/Soldiers below rather than duplicated three times;
 * `populationLayer`'s own implementation is left untouched. Each caller
 * supplies its own `lowColor`/`highColor` so the layers stay visually
 * distinguishable from each other and from Population when switched
 * between (constitution Principle VI / spec SC-004). */
function numericLayer(
  id: string,
  label: string,
  tooltipLabel: string,
  getValue: (row: MapLocationRow) => number | null,
  lowColor: [number, number, number],
  highColor: [number, number, number],
): MapLayer {
  const maxCache = new WeakMap<MapLocationDataset, number>();
  function getMax(dataset: MapLocationDataset): number {
    const cached = maxCache.get(dataset);
    if (cached !== undefined) return cached;
    let max = 0;
    for (const row of dataset.values()) {
      const value = getValue(row);
      if (value !== null && value > max) max = value;
    }
    maxCache.set(dataset, max);
    return max;
  }

  return {
    id,
    label,
    getFill(row, dataset) {
      const value = getValue(row);
      if (value === null || value <= 0) return NEUTRAL_COLOR;
      const max = getMax(dataset);
      if (max <= 0) return NEUTRAL_COLOR;
      const t = Math.log1p(value) / Math.log1p(max);
      return [
        lerp(lowColor[0], highColor[0], t),
        lerp(lowColor[1], highColor[1], t),
        lerp(lowColor[2], highColor[2], t),
      ];
    },
    getTooltipFields(row) {
      const value = getValue(row);
      return [
        { label: "Location", value: row.name },
        {
          label: tooltipLabel,
          value: value === null ? "No data" : value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
        },
      ];
    },
    getLegend() {
      return [
        { color: NEUTRAL_COLOR, label: "No data" },
        { color: lowColor, label: "Low" },
        { color: highColor, label: "High" },
      ];
    },
  };
}

// --- User Story 1 (specs/011-atlas-map-modes): Development ---------------

// post-ship correction (2026-09-21, user request): colored by each
// location's *percentile rank* among every developed location rather than
// `numericLayer`'s log-normalized value scale — rank spreads every
// location evenly across the gradient by construction (each rank step is
// exactly 1/N apart), so differences stay visually telling regardless of
// how skewed the real development values are. user request 2026-09-22:
// now shares rankSpectralLayer's 7-stop purple→red gradient with
// Population/Tax Base rather than its own bespoke red→green pair.
const developmentLayer = rankSpectralLayer(
  "development",
  "Development",
  "Development",
  (row) => row.development,
);
MAP_LAYERS.push(developmentLayer);

// --- User Story 2 (specs/011-atlas-map-modes): Location Terrain ----------

/** Every distinct topography category, assigned a stable golden-angle-hue
 * color once per module load — terrain never varies by save (it's static
 * game-definition data, `locationTerrain.ts`'s own doc comment), so this
 * is computed once, not memoized per dataset like the numeric layers or
 * RGO's per-save assignment. Sorted first for a deterministic assignment
 * order independent of the generated table's own key order. */
const TERRAIN_COLORS: Map<string, [number, number, number]> = (() => {
  const categories = Array.from(new Set(Object.values(LOCATION_TERRAIN))).sort();
  const colors = new Map<string, [number, number, number]>();
  categories.forEach((category, i) => {
    colors.set(category, hslToRgb(i * GOLDEN_ANGLE_DEG, RGO_SATURATION, RGO_LIGHTNESS));
  });
  return colors;
})();

const terrainLayer: MapLayer = {
  id: "terrain",
  label: "Location Terrain",
  getFill(row) {
    const topography = LOCATION_TERRAIN[row.name];
    if (topography === undefined) return NEUTRAL_COLOR;
    return TERRAIN_COLORS.get(topography) ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    const topography = LOCATION_TERRAIN[row.name];
    return [
      { label: "Location", value: row.name },
      { label: "Terrain", value: topography ?? "No data" },
    ];
  },
  getLegend() {
    const entries = Array.from(TERRAIN_COLORS, ([label, color]) => ({ color, label }));
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  },
};
MAP_LAYERS.push(terrainLayer);

// --- User Story 3 (specs/011-atlas-map-modes): Location Rank -------------

// Confirmed against a real save (research.md §7): exactly these 4
// settlement tiers exist, a small closed set — no dynamic/fallback color
// assignment needed, unlike Terrain/Culture/Religion/Market's open sets.
const RANK_COLORS: Record<string, [number, number, number]> = {
  rural_settlement: [255, 247, 188],
  town: [254, 196, 79],
  city: [217, 95, 14],
  megalopolis: [127, 39, 4],
};

const rankLayer: MapLayer = {
  id: "rank",
  label: "Location Rank",
  getFill(row) {
    if (row.rank === null) return NEUTRAL_COLOR;
    return RANK_COLORS[row.rank] ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Rank", value: row.rank ?? "No data" },
    ];
  },
  getLegend() {
    return Object.entries(RANK_COLORS).map(([label, color]) => ({ color, label }));
  },
};
MAP_LAYERS.push(rankLayer);

// --- User Story 4 (specs/011-atlas-map-modes): Primary Culture -----------

const primaryCultureLayer: MapLayer = {
  id: "primaryCulture",
  label: "Primary Culture",
  getFill(row) {
    return row.cultureColor ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Culture", value: row.cultureName ?? "No data" },
    ];
  },
  getLegend(dataset) {
    const entries = new Map<string, [number, number, number]>();
    for (const row of dataset.values()) {
      if (row.cultureName !== null && row.cultureColor !== null) {
        entries.set(row.cultureName, row.cultureColor);
      }
    }
    return Array.from(entries, ([label, color]) => ({ color, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  },
};
MAP_LAYERS.push(primaryCultureLayer);

// --- User Story 5 (specs/011-atlas-map-modes): Primary Religion ----------

const primaryReligionLayer: MapLayer = {
  id: "primaryReligion",
  label: "Primary Religion",
  getFill(row) {
    return row.religionColor ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Religion", value: row.religionName ?? "No data" },
    ];
  },
  getLegend(dataset) {
    const entries = new Map<string, [number, number, number]>();
    for (const row of dataset.values()) {
      if (row.religionName !== null && row.religionColor !== null) {
        entries.set(row.religionName, row.religionColor);
      }
    }
    return Array.from(entries, ([label, color]) => ({ color, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  },
};
MAP_LAYERS.push(primaryReligionLayer);

// --- User Story 6 (specs/011-atlas-map-modes): Location Market -----------

// Sea/lake terrain categories (research.md §5's 21 confirmed topography
// values) — post-ship correction, 2026-09-21 (user report): a market's
// raw membership can include coastal/open-water locations for naval
// trade-route purposes, but coloring water the same as the market's land
// territory misrepresents what this layer shows, so water locations are
// excluded from both the fill and the market-name/color assignment below.
// `salt_pans`/`atoll` are land features, deliberately not included here.
const WATER_TERRAIN = new Set([
  "ocean",
  "deep_ocean",
  "coastal_ocean",
  "ocean_wasteland",
  "inland_sea",
  "narrows",
  "lakes",
  "high_lakes",
]);

function isWaterLocation(row: MapLocationRow): boolean {
  const topography = LOCATION_TERRAIN[row.name];
  return topography !== undefined && WATER_TERRAIN.has(topography);
}

/** Memoized per dataset reference (see the MapLayer interface's doc
 * comment) — markets have no in-game color of their own (unlike
 * culture/religion, research.md §6), so colors mirror RGO's own
 * getRgoColorMap: a stable golden-angle hue assigned in first-encountered
 * order while scanning the dataset. Names come from `row.marketName`
 * (queries.ts's `market_name`, the market's real center-location name —
 * post-ship correction, 2026-09-21: previously a bare "Market <idx>"). */
interface MarketInfo {
  color: [number, number, number];
  name: string;
}
const marketInfoCache = new WeakMap<MapLocationDataset, Map<number, MarketInfo>>();
function getMarketInfo(dataset: MapLocationDataset): Map<number, MarketInfo> {
  const cached = marketInfoCache.get(dataset);
  if (cached) return cached;
  const info = new Map<number, MarketInfo>();
  let index = 0;
  for (const row of dataset.values()) {
    if (row.marketIdx === null || isWaterLocation(row) || info.has(row.marketIdx)) continue;
    info.set(row.marketIdx, {
      color: hslToRgb(index * GOLDEN_ANGLE_DEG, RGO_SATURATION, RGO_LIGHTNESS),
      name: row.marketName ?? `Market ${row.marketIdx}`,
    });
    index += 1;
  }
  marketInfoCache.set(dataset, info);
  return info;
}

const marketLayer: MapLayer = {
  id: "market",
  label: "Location Market",
  getFill(row, dataset) {
    if (row.marketIdx === null || isWaterLocation(row)) return NEUTRAL_COLOR;
    return getMarketInfo(dataset).get(row.marketIdx)?.color ?? NEUTRAL_COLOR;
  },
  getTooltipFields(row) {
    const excluded = row.marketIdx === null || isWaterLocation(row);
    return [
      { label: "Location", value: row.name },
      { label: "Market", value: excluded ? "No data" : (row.marketName ?? `Market ${row.marketIdx}`) },
    ];
  },
  getLegend(dataset) {
    const entries = Array.from(getMarketInfo(dataset).values(), ({ color, name }) => ({
      color,
      label: name,
    }));
    entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return entries;
  },
};
MAP_LAYERS.push(marketLayer);

// --- User Story 7 (specs/011-atlas-map-modes): Tax Base -------------------

// user request 2026-09-22: shares rankSpectralLayer's percentile-rank +
// 7-stop purple→red gradient with Population/Development, rather than
// numericLayer's log-normalized low/high pair (still used by Soldiers
// below, untouched).
const taxBaseLayer = rankSpectralLayer("taxBase", "Tax Base", "Tax Base", (row) => row.possibleTax);
MAP_LAYERS.push(taxBaseLayer);

// --- User Story 8 (specs/011-atlas-map-modes): Soldiers -------------------

const soldiersLayer = numericLayer(
  "soldiers",
  "Soldiers",
  "Soldiers",
  (row) => row.soldiers,
  [254, 229, 217],
  [165, 15, 21],
);
MAP_LAYERS.push(soldiersLayer);
