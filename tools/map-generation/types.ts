// Shared types for the province map generation pipeline.
// See specs/003-province-map-generation/data-model.md for the authoritative
// shape definitions this file implements.

import type { Polygon, MultiPolygon } from "geojson";

/** Parsed from named_locations/*.txt: one per paintable location. */
export interface NamedLocation {
  name: string;
  color: readonly [r: number, g: number, b: number];
}

/** An inclusive [xStart, xEnd] run of same-color pixels on one bitmap row. */
export interface PixelRun {
  xStart: number;
  xEnd: number;
}

/**
 * The set of locations.png pixels matching one NamedLocation's color,
 * as a run-length-encoded map of row (y) -> sorted, non-overlapping runs.
 * Run-length encoding keeps this tractable against the real ~134M-pixel
 * bitmap (research.md §1), where per-pixel Set<[x,y]> storage would not be.
 */
export interface LocationPixelRegion {
  name: string;
  rows: Map<number, PixelRun[]>;
}

/** Parsed from definitions.txt: a province's name and its member locations. */
export interface ProvinceGrouping {
  name: string;
  locationNames: string[];
}

/** A closed sequence of pixel coordinates: [exterior ring, ...hole rings]. */
export type PixelRing = Array<readonly [x: number, y: number]>;

/** One traced polygon (exterior + optional holes), in raw pixel coordinates. */
export type RawPolygon = PixelRing[];

/**
 * A province's traced geometry before projection/topology-building.
 * One entry in `polygons` = a Polygon; more than one = a MultiPolygon
 * (non-contiguous province — see research.md §6).
 */
export interface ProvinceGeometry {
  name: string;
  polygons: RawPolygon[];
}

/** Per-province properties carried through projection, topology-building, and decoding. */
export interface ProvinceProperties {
  name: string;
  location_count: number;
}

/**
 * Per-location properties. Name-keyed only (matching the game's own
 * named_locations convention, per research.md §2's naming decision for
 * provinces) — see research.md §9 for why there's no numeric idx here
 * either, and the resulting join gap against the save schema (no
 * `locations.name` column exists yet).
 */
export interface LocationProperties {
  name: string;
}

/** A province's geometry after equirectangular projection (research.md §3), GeoJSON-shaped and ready for topojson-server's topology(). */
export interface ProjectedProvinceFeature {
  type: "Feature";
  properties: ProvinceProperties;
  geometry: Polygon | MultiPolygon;
}

/** A single location's geometry after equirectangular projection — same shape as a province feature, minus the location_count (a location has no members of its own). */
export interface ProjectedLocationFeature {
  type: "Feature";
  properties: LocationProperties;
  geometry: Polygon | MultiPolygon;
}

/** Top-level metadata written into every output Topology's `properties` (data-model.md's Output entity). */
export interface MapAssetProperties {
  generated_from_game_version: string;
  generated_at: string;
  source_bitmap_width: number;
  source_bitmap_height: number;
  province_count: number;
  location_count: number;
  skipped_location_names: string[];
}

/** Result of a full generation run, before/independent of writing to disk. */
export interface GenerationResult {
  properties: MapAssetProperties;
  provinceFeatures: ProjectedProvinceFeature[];
  locationFeatures: ProjectedLocationFeature[];
}

export interface CliOptions {
  installPath: string;
  outPath: string;
  outLocationsPath: string;
  gameVersion: string;
}
