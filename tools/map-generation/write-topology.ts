// Builds the output TopoJSON asset(s): topology-build (topojson-server),
// simplify on the resulting shared arcs (topojson-simplify — research.md
// §4's ordering requirement: simplify AFTER deduplicating shared borders,
// not before, so two neighboring shapes' shared edge stays one consistent
// line), validate, and write to disk (data-model.md's Output entity +
// validation rules).
//
// Two outputs, per research.md §9: `provinces.topojson` carries BOTH
// `objects.provinces` and `objects.locations`, built in one topology()
// call so the two layers share arcs (most province borders are unions of
// location borders, so this is also the more space-efficient option);
// `locations.topojson` carries `objects.locations` alone, for a consumer
// that only wants the fine-grained layer.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  LocationProperties,
  MapAssetProperties,
  ProjectedLocationFeature,
  ProjectedProvinceFeature,
  ProvinceProperties,
} from "./types";

export class TopologyValidationError extends Error {}

/**
 * Simplification weight threshold, in projected-degree units. Chosen
 * empirically against the real generated asset (4,309 provinces,
 * ~134M-pixel source bitmap): the raw trace is a literal pixel-staircase
 * (one vertex per unit pixel edge, no collinear-point merging), so most
 * of that detail is redundant noise, not real shape information.
 * Weight 0.005 landed the real output at ~5.8MB (vs ~39MB unsimplified)
 * while still tracing recognizably correct province shapes — the plan's
 * "comfortably under the low tens of MB" soft target (plan.md's
 * Constraints). Exact tolerance is an implementation detail per
 * contracts/map-asset-schema.md's "explicitly not guaranteed" note, so
 * this can be revisited without breaking the asset's contract.
 */
const SIMPLIFY_MIN_WEIGHT = 0.005;

type ProvinceGeometryCollection = GeometryCollection<ProvinceProperties>;
type LocationGeometryCollection = GeometryCollection<LocationProperties>;

export type CombinedMapTopology = Topology<{
  provinces: ProvinceGeometryCollection;
  locations: LocationGeometryCollection;
}> & { properties: MapAssetProperties };

export type LocationsOnlyTopology = Topology<{ locations: LocationGeometryCollection }> & {
  properties: MapAssetProperties;
};

interface NamedFeature {
  properties: { name: string };
  geometry: Polygon | MultiPolygon;
}

export function validateFeatures(features: NamedFeature[], kind: string): void {
  const seenNames = new Set<string>();
  for (const f of features) {
    if (seenNames.has(f.properties.name)) {
      throw new TopologyValidationError(`duplicate ${kind} name: ${f.properties.name}`);
    }
    seenNames.add(f.properties.name);

    const isEmpty =
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates.length === 0
        : f.geometry.coordinates.every((polygon) => polygon.length === 0);
    if (isEmpty) {
      throw new TopologyValidationError(`empty geometry for ${kind}: ${f.properties.name}`);
    }
  }
}

function validateRoundTrip<P extends { name: string }>(
  topo: Topology,
  objectKey: string,
  expectedCount: number,
): void {
  const decoded = feature<P>(
    topo,
    topo.objects[objectKey] as GeometryCollection<P>,
  ) as unknown as FeatureCollection<Polygon | MultiPolygon, P>;
  const decodedFeatures = decoded.features;

  if (decodedFeatures.length !== expectedCount) {
    throw new TopologyValidationError(
      `decoded ${objectKey} feature count (${decodedFeatures.length}) does not match input count (${expectedCount})`,
    );
  }
  for (const f of decodedFeatures) {
    if (!f.properties?.name) {
      throw new TopologyValidationError(`a decoded ${objectKey} feature is missing its name property`);
    }
  }
}

function toFeatureCollection<P>(
  features: Array<{ type: "Feature"; properties: P; geometry: Polygon | MultiPolygon }>,
): FeatureCollection<Polygon | MultiPolygon, P> {
  return { type: "FeatureCollection", features } as FeatureCollection<Polygon | MultiPolygon, P>;
}

/** Builds `provinces.topojson`'s content: both layers, sharing arcs. */
export function buildCombinedTopology(
  provinceFeatures: ProjectedProvinceFeature[],
  locationFeatures: ProjectedLocationFeature[],
  properties: MapAssetProperties,
): CombinedMapTopology {
  validateFeatures(provinceFeatures, "province");
  validateFeatures(locationFeatures, "location");

  const raw = topology({
    provinces: toFeatureCollection(provinceFeatures),
    locations: toFeatureCollection(locationFeatures),
  }) as Topology<{ provinces: ProvinceGeometryCollection; locations: LocationGeometryCollection }>;

  const simplified = simplify(presimplify(raw), SIMPLIFY_MIN_WEIGHT);
  const withProperties: CombinedMapTopology = { ...simplified, properties };

  validateRoundTrip<ProvinceProperties>(withProperties, "provinces", provinceFeatures.length);
  validateRoundTrip<LocationProperties>(withProperties, "locations", locationFeatures.length);
  return withProperties;
}

/** Builds `locations.topojson`'s content: the locations layer alone. */
export function buildLocationsOnlyTopology(
  locationFeatures: ProjectedLocationFeature[],
  properties: MapAssetProperties,
): LocationsOnlyTopology {
  validateFeatures(locationFeatures, "location");

  const raw = topology({
    locations: toFeatureCollection(locationFeatures),
  }) as Topology<{ locations: LocationGeometryCollection }>;

  const simplified = simplify(presimplify(raw), SIMPLIFY_MIN_WEIGHT);
  const withProperties: LocationsOnlyTopology = { ...simplified, properties };

  validateRoundTrip<LocationProperties>(withProperties, "locations", locationFeatures.length);
  return withProperties;
}

export function writeTopologyFile(outPath: string, topo: object): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(topo));
}
