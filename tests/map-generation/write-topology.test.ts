import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import {
  buildCombinedTopology,
  buildLocationsOnlyTopology,
  TopologyValidationError,
  writeTopologyFile,
} from "../../tools/map-generation/write-topology";
import type {
  LocationProperties,
  MapAssetProperties,
  ProjectedLocationFeature,
  ProjectedProvinceFeature,
  ProvinceProperties,
} from "../../tools/map-generation/types";

const BASE_PROPERTIES: MapAssetProperties = {
  generated_from_game_version: "test",
  generated_at: "2026-09-18T00:00:00.000Z",
  source_bitmap_width: 20,
  source_bitmap_height: 10,
  province_count: 0,
  location_count: 0,
  skipped_location_names: [],
};

function unitSquareRing(x0: number, y0: number) {
  return [
    [
      [x0, y0],
      [x0 + 1, y0],
      [x0 + 1, y0 + 1],
      [x0, y0 + 1],
      [x0, y0],
    ],
  ];
}

function provinceFeature(name: string, x0: number, y0: number): ProjectedProvinceFeature {
  return {
    type: "Feature",
    properties: { name, location_count: 1 },
    geometry: { type: "Polygon", coordinates: unitSquareRing(x0, y0) },
  };
}

function locationFeature(name: string, x0: number, y0: number): ProjectedLocationFeature {
  return {
    type: "Feature",
    properties: { name },
    geometry: { type: "Polygon", coordinates: unitSquareRing(x0, y0) },
  };
}

describe("write-topology buildCombinedTopology validation", () => {
  it("rejects a duplicate province name", () => {
    const provinces = [provinceFeature("dup", 0, 0), provinceFeature("dup", 5, 0)];
    const locations = [locationFeature("loc_a", 0, 0)];
    expect(() => buildCombinedTopology(provinces, locations, BASE_PROPERTIES)).toThrow(
      TopologyValidationError,
    );
  });

  it("rejects a feature with empty geometry coordinates", () => {
    const empty: ProjectedProvinceFeature = {
      type: "Feature",
      properties: { name: "empty_province", location_count: 0 },
      geometry: { type: "Polygon", coordinates: [] },
    };
    expect(() =>
      buildCombinedTopology([empty], [locationFeature("loc_a", 0, 0)], BASE_PROPERTIES),
    ).toThrow(TopologyValidationError);
  });

  it("rejects a duplicate location name independently of province names", () => {
    const provinces = [provinceFeature("province_a", 0, 0)];
    const locations = [locationFeature("dup", 0, 0), locationFeature("dup", 5, 0)];
    expect(() => buildCombinedTopology(provinces, locations, BASE_PROPERTIES)).toThrow(
      TopologyValidationError,
    );
  });
});

describe("write-topology buildCombinedTopology topology-sharing", () => {
  it("makes two adjacent provinces reference at least one shared arc", () => {
    // square_a: unit square at (0,0)-(1,1); square_b: unit square at (1,0)-(2,1)
    // — they share the edge x=1, y=[0,1].
    const provinces = [provinceFeature("square_a", 0, 0), provinceFeature("square_b", 1, 0)];
    const locations = [locationFeature("loc_a", 0, 0), locationFeature("loc_b", 1, 0)];

    const topo = buildCombinedTopology(provinces, locations, BASE_PROPERTIES);
    const geometries = topo.objects.provinces.geometries as { arcs: number[][] }[];

    const absArcIndices = (arcs: number[][]) => new Set(arcs.flat().map((i) => (i < 0 ? ~i : i)));
    const arcsA = absArcIndices(geometries[0].arcs);
    const arcsB = absArcIndices(geometries[1].arcs);
    const shared = [...arcsA].filter((i) => arcsB.has(i));

    expect(shared.length).toBeGreaterThan(0);
  });

  it("shares arcs across the provinces and locations objects when a province's shape matches its sole location's shape", () => {
    // A single-location province: its traced shape is identical to that
    // location's own shape (exactly what happens in the real pipeline
    // when a province has only one member location) — the two objects
    // should reference the same underlying arc(s), not duplicate them.
    const provinces = [provinceFeature("solo_province", 0, 0)];
    const locations = [locationFeature("solo_location", 0, 0)];

    const topo = buildCombinedTopology(provinces, locations, BASE_PROPERTIES);
    const provinceArcs = (topo.objects.provinces.geometries[0] as { arcs: number[][] }).arcs;
    const locationArcs = (topo.objects.locations.geometries[0] as { arcs: number[][] }).arcs;

    const absArcIndices = (arcs: number[][]) => new Set(arcs.flat().map((i) => (i < 0 ? ~i : i)));
    const shared = [...absArcIndices(provinceArcs)].filter((i) =>
      absArcIndices(locationArcs).has(i),
    );

    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("write-topology buildCombinedTopology + writeTopologyFile round-trip", () => {
  it("writes a file that decodes via topojson-client back to the original province and location names", () => {
    const provinces = [provinceFeature("square_a", 0, 0), provinceFeature("square_b", 5, 0)];
    const locations = [locationFeature("loc_a", 0, 0), locationFeature("loc_b", 5, 0)];
    const topo = buildCombinedTopology(provinces, locations, {
      ...BASE_PROPERTIES,
      province_count: 2,
      location_count: 2,
    });

    const dir = mkdtempSync(join(tmpdir(), "map-gen-test-"));
    const outPath = join(dir, "provinces.topojson");
    writeTopologyFile(outPath, topo);

    const written = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(written.type).toBe("Topology");

    const decodedProvinces = feature<ProvinceProperties>(
      written,
      written.objects.provinces,
    ) as unknown as FeatureCollection<Geometry, ProvinceProperties>;
    expect(decodedProvinces.features.map((f) => f.properties?.name).sort()).toEqual([
      "square_a",
      "square_b",
    ]);

    const decodedLocations = feature<LocationProperties>(
      written,
      written.objects.locations,
    ) as unknown as FeatureCollection<Geometry, LocationProperties>;
    expect(decodedLocations.features.map((f) => f.properties?.name).sort()).toEqual([
      "loc_a",
      "loc_b",
    ]);
  });
});

describe("write-topology buildLocationsOnlyTopology", () => {
  it("builds a topology with only a locations object", () => {
    const locations = [locationFeature("loc_a", 0, 0), locationFeature("loc_b", 5, 0)];
    const topo = buildLocationsOnlyTopology(locations, {
      ...BASE_PROPERTIES,
      location_count: 2,
    });

    expect(topo.objects.locations).toBeDefined();
    expect((topo.objects as Record<string, unknown>).provinces).toBeUndefined();
    expect(topo.objects.locations.geometries).toHaveLength(2);
  });

  it("rejects a duplicate location name", () => {
    const locations = [locationFeature("dup", 0, 0), locationFeature("dup", 5, 0)];
    expect(() => buildLocationsOnlyTopology(locations, BASE_PROPERTIES)).toThrow(
      TopologyValidationError,
    );
  });
});
