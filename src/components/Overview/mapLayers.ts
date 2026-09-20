// specs/005-map-visualization: the four map modes (spec Key Entities:
// Map Layer). Each user story appends exactly one entry to MAP_LAYERS —
// this file has no layer-specific logic of its own beyond the shared
// type and the neutral "no data" fill every layer falls back to
// (spec FR-009).
import type { MapLocationDataset, MapLocationRow } from "./mapLocationData";
import { RGO_GAME_COLORS } from "./rgoGameColors";

/** Shared "unowned / no confirmed data" fill (spec Edge Cases,
 * FR-009) — a light, desaturated gray, distinguishable from any
 * plausible in-game country color without relying on hue alone
 * (constitution Principle VI: every layer also carries a text
 * label/tooltip, never color as the only signal). */
export const NEUTRAL_COLOR: [number, number, number] = [200, 200, 200];

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

// --- User Story 3: Location Population ---------------------------------

const POPULATION_LOW: [number, number, number] = [224, 236, 244];
const POPULATION_HIGH: [number, number, number] = [8, 81, 156];

// Memoized per dataset reference (interface doc comment above) — a
// dataset's max population is scanned once, not once per row, since
// getFill runs once per visible location every redraw.
const populationMaxCache = new WeakMap<MapLocationDataset, number>();
function getMaxPopulation(dataset: MapLocationDataset): number {
  const cached = populationMaxCache.get(dataset);
  if (cached !== undefined) return cached;
  let max = 0;
  for (const row of dataset.values()) {
    if (row.totalPopulation > max) max = row.totalPopulation;
  }
  populationMaxCache.set(dataset, max);
  return max;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

const populationLayer: MapLayer = {
  id: "population",
  label: "Location Population",
  getFill(row, dataset) {
    if (row.totalPopulation <= 0) return NEUTRAL_COLOR;
    const max = getMaxPopulation(dataset);
    if (max <= 0) return NEUTRAL_COLOR;
    // log-normalized, not linear min-max (spec Edge Cases: one huge
    // location must not wash out variation among the rest — research.md
    // §4's rationale for a perceptual, not raw-linear, scale).
    const t = Math.log1p(row.totalPopulation) / Math.log1p(max);
    return [
      lerp(POPULATION_LOW[0], POPULATION_HIGH[0], t),
      lerp(POPULATION_LOW[1], POPULATION_HIGH[1], t),
      lerp(POPULATION_LOW[2], POPULATION_HIGH[2], t),
    ];
  },
  getTooltipFields(row) {
    return [
      { label: "Location", value: row.name },
      { label: "Population", value: row.totalPopulation.toLocaleString() },
    ];
  },
  getLegend() {
    return [
      { color: NEUTRAL_COLOR, label: "No population data" },
      { color: POPULATION_LOW, label: "Sparse" },
      { color: POPULATION_HIGH, label: "Dense" },
    ];
  },
};
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
