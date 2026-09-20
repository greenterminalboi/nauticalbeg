import { useEffect, useState } from "react";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { MapCanvas, type MapFeature, type PointerPosition } from "./MapCanvas";
import { MapLegend } from "./MapLegend";
import { MapSidebar } from "./MapSidebar";
import { MAP_LAYERS } from "./mapLayers";
import { loadMapLocationDataset, type MapLocationDataset } from "./mapLocationData";
import type { SaveDatabase } from "../../storage/db";
import "./MapTab.css";

// public/map/locations.topojson (specs/003-province-map-generation) —
// the fine-grained locations-only asset, since this feature renders at
// full per-location detail (spec Assumptions), not province granularity.
const GEOMETRY_URL = "/map/locations.topojson";

// Offset (CSS px) from the cursor to the tooltip's top-left corner, so it
// trails just below/right of the pointer instead of sitting under it.
const TOOLTIP_OFFSET = 16;

interface MapTabProps {
  db: SaveDatabase;
}

/**
 * specs/005-map-visualization: the Map tab's entry point, replacing
 * FileLoader's `<ComingSoonPlaceholder feature="Map" />`. Loads the
 * generated map geometry and this save's per-location dataset once
 * (research.md §7/FR-017) and renders the sidebar (User Story 2) plus
 * the active layer's canvas + legend + hover tooltip. `activeLayerId`/
 * `sidebarCollapsed` live here, not in `MapSidebar` or `MapCanvas`, so
 * switching layers or collapsing the sidebar only changes what's passed
 * down — `MapCanvas` itself never unmounts, which is what keeps its
 * internal pan/zoom ref alive across both (spec FR-011, SC-002, SC-005).
 */
export function MapTab({ db }: MapTabProps) {
  const [features, setFeatures] = useState<MapFeature[] | null>(null);
  const [dataset, setDataset] = useState<MapLocationDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLocationName, setHoveredLocationName] = useState<string | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<PointerPosition | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(MAP_LAYERS[0]?.id ?? null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFeatures(null);
    setDataset(null);
    setError(null);
    setHoveredLocationName(null);
    setHoveredPosition(null);

    (async () => {
      const [response, loadedDataset] = await Promise.all([
        fetch(GEOMETRY_URL),
        loadMapLocationDataset(db),
      ]);
      if (cancelled) return;
      if (!response.ok) {
        setError(`Could not load the map geometry asset (HTTP ${response.status}).`);
        return;
      }
      const topology = await response.json();
      const decoded = feature(topology, topology.objects.locations) as unknown as FeatureCollection<
        Geometry,
        { name: string }
      >;
      if (cancelled) return;
      setFeatures(decoded.features as MapFeature[]);
      setDataset(loadedDataset);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the map.");
    });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const activeLayer = MAP_LAYERS.find((l) => l.id === activeLayerId) ?? MAP_LAYERS[0] ?? null;

  if (error) {
    return (
      <p role="alert" className="map-tab__status">
        {error}
      </p>
    );
  }
  if (!features || !dataset) {
    return <p className="map-tab__status">Loading map…</p>;
  }

  const hoveredRow = hoveredLocationName ? dataset.get(hoveredLocationName) : undefined;

  return (
    <div className="map-tab">
      {activeLayer ? (
        <>
          <MapCanvas
            features={features}
            dataset={dataset}
            activeLayer={activeLayer}
            onHoverLocation={(name, position) => {
              setHoveredLocationName(name);
              setHoveredPosition(position);
            }}
          />
          <MapSidebar
            layers={MAP_LAYERS}
            activeLayerId={activeLayer.id}
            onSelectLayer={setActiveLayerId}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          />
          <MapLegend
            title={activeLayer.label}
            entries={activeLayer.getLegend(dataset)}
            collapsed={legendCollapsed}
            onToggleCollapsed={() => setLegendCollapsed((c) => !c)}
          />
          {hoveredRow && hoveredPosition && (
            <div
              className="map-tab__tooltip"
              role="status"
              style={{ left: hoveredPosition.x + TOOLTIP_OFFSET, top: hoveredPosition.y + TOOLTIP_OFFSET }}
            >
              {activeLayer.getTooltipFields(hoveredRow).map((f) => (
                <div key={f.label}>
                  <strong>{f.label}:</strong> {f.value}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="map-tab__status">No map layers available yet.</p>
      )}
    </div>
  );
}
