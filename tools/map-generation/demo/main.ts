// Dev-only demo viewer (spec User Story 2 / FR-011, FR-012). Loads the
// generated asset, draws every province's AND every location's border,
// and supports pan + zoom in/out. Deliberately minimal: no styling beyond
// visible outlines, no coloring/overlays/interactivity — see research.md
// §7 for why (and why no map-projection or pan/zoom library is used here).

import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { LocationProperties, ProvinceProperties } from "../types";

const ASSET_URL = "/map/provinces.topojson"; // carries both objects.provinces and objects.locations
const VIEWBOX_WIDTH = 360; // matches index.html's viewBox="0 0 360 180"
const VIEWBOX_HEIGHT = 180;
const MIN_SCALE = 0.5;
const MAX_SCALE = 400;

const statusEl = document.getElementById("status")!;
const svg = document.getElementById("map") as unknown as SVGSVGElement;
const layersGroup = document.getElementById("layers") as unknown as SVGGElement;
const locationsLayer = document.getElementById("locations-layer") as unknown as SVGGElement;
const provincesLayer = document.getElementById("provinces-layer") as unknown as SVGGElement;

// Equirectangular [lon, lat] -> this viewer's SVG user-space, the exact
// inverse of tools/map-generation/project.ts's pixel->[lon,lat] mapping.
function lonLatToViewBox(lon: number, lat: number): [number, number] {
  return [lon + VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2 - lat];
}

function ringToPath(ring: number[][]): string {
  return ring
    .map(([lon, lat], i) => {
      const [x, y] = lonLatToViewBox(lon, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(" ") + " Z";
}

function geometryToPathData(geometry: Geometry): string {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringToPath)).join(" ");
  }
  return "";
}

function renderLayer(features: Array<{ geometry: Geometry }>, group: SVGGElement): void {
  const fragment = document.createDocumentFragment();
  for (const f of features) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", geometryToPathData(f.geometry));
    fragment.appendChild(path);
  }
  group.appendChild(fragment);
}

async function loadAndRender(): Promise<void> {
  const response = await fetch(ASSET_URL);
  if (!response.ok) {
    statusEl.textContent =
      `No asset found at ${ASSET_URL} (HTTP ${response.status}) — ` +
      `run \`npm run generate:map -- --install <path>\` first.`;
    return;
  }

  const topology = await response.json();

  const provinces = feature<ProvinceProperties>(
    topology,
    topology.objects.provinces,
  ) as unknown as FeatureCollection<Geometry, ProvinceProperties>;
  const locations = feature<LocationProperties>(
    topology,
    topology.objects.locations,
  ) as unknown as FeatureCollection<Geometry, LocationProperties>;

  renderLayer(locations.features, locationsLayer);
  renderLayer(provinces.features, provincesLayer);

  statusEl.textContent =
    `${provinces.features.length} provinces, ${locations.features.length} locations — ` +
    `drag to pan, scroll to zoom`;
}

// --- Pan & zoom: a single translate(tx,ty) scale(s) transform on
// #layers (both sublayers move together). getScreenCTM() on the *root*
// <svg> gives an exact screen<->viewBox mapping regardless of
// viewBox/CSS sizing, so pan/zoom math stays correct without hand-rolling
// the SVG's own layout math.
let tx = 0;
let ty = 0;
let scale = 1;

function applyTransform(): void {
  layersGroup.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
}

function screenToViewBox(clientX: number, clientY: number): [number, number] {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return [0, 0];
  const transformed = point.matrixTransform(ctm.inverse());
  return [transformed.x, transformed.y];
}

let dragging = false;
let lastView: [number, number] = [0, 0];

svg.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastView = screenToViewBox(e.clientX, e.clientY);
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const view = screenToViewBox(e.clientX, e.clientY);
  tx += view[0] - lastView[0];
  ty += view[1] - lastView[1];
  lastView = view;
  applyTransform();
});

svg.addEventListener("pointerup", (e) => {
  dragging = false;
  svg.releasePointerCapture(e.pointerId);
});

svg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const [viewX, viewY] = screenToViewBox(e.clientX, e.clientY);
    const localX = (viewX - tx) / scale;
    const localY = (viewY - ty) / scale;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * zoomFactor));

    tx = viewX - scale * localX;
    ty = viewY - scale * localY;
    applyTransform();
  },
  { passive: false },
);

loadAndRender().catch((err: unknown) => {
  statusEl.textContent = `Failed to load/render the map asset: ${err}`;
});
