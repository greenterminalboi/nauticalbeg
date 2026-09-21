import { useEffect, useMemo, useRef } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { Feature, Geometry } from "geojson";
import type { MapLocationDataset } from "./mapLocationData";
import type { MapLayer } from "./mapLayers";
import { NEUTRAL_COLOR } from "./mapLayers";
import { buildHitTestIndex, type HitTestPolygon } from "./mapHitTest";
import "./MapCanvas.css";

export type MapFeature = Feature<Geometry, { name: string }>;

/** Pointer position in `.map-canvas`-relative CSS pixels — the same
 * coordinate space `MapTab`'s tooltip lives in, so it can follow the
 * cursor with a plain inline `left`/`top` instead of a fixed corner. */
export interface PointerPosition {
  x: number;
  y: number;
}

interface MapCanvasProps {
  features: MapFeature[];
  dataset: MapLocationDataset;
  activeLayer: MapLayer;
  onHoverLocation?: (name: string | null, position: PointerPosition | null) => void;
  onSelectLocation?: (name: string | null) => void;
}

// Same equirectangular [lon, lat] -> flat-plane convention validated by
// tools/map-generation/demo/main.ts (research.md §8) — the exact inverse
// of tools/map-generation/project.ts's pixel->[lon,lat] mapping. World
// space here is [0, WORLD_WIDTH] x [0, WORLD_HEIGHT], matching that
// demo's viewBox convention, just drawn via Canvas instead of SVG
// (research.md §8's scale rationale).
const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 180;
const MIN_SCALE = 0.5;
const MAX_SCALE = 400;

// Horizontal wraparound (drawing every polygon once per visible "copy" of
// the world) was tried and reverted (2026-09-20): at this feature's
// ~28,573-location scale, drawing multiple copies per frame measurably
// hurt pan/zoom responsiveness (spec SC-006), and the single-world view
// already covers the map adequately at its default fit-to-screen zoom.

function toWorld([lon, lat]: number[]): [number, number] {
  return [lon + WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - lat];
}

function ringToWorld(ring: number[][]): Array<[number, number]> {
  return ring.map(toWorld);
}

function featureToRings(geometry: Geometry): Array<Array<[number, number]>> {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToWorld);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringToWorld));
  }
  return [];
}

function rgbToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// post-ship correction (2026-09-21): every location was previously drawn
// as its own separate fill path with no stroke at all — adjacent
// locations only looked visually separated where two independently-filled
// paths happened to leave a sub-pixel anti-aliasing gap, an incidental
// rendering artifact rather than a deliberate boundary. That gap shrinks
// below a pixel and disappears entirely at low zoom (the whole world in
// view), making same-owner regions read as one smooth blob instead of
// many locations. A real stroke keeps location boundaries visibly
// consistent at every zoom level, not just when zoomed in far enough for
// the old incidental gaps to show.
const BORDER_COLOR = "rgba(255, 255, 255, 0.35)";
const BORDER_WIDTH_SCREEN_PX = 1;

/**
 * specs/005-map-visualization research.md §8/§9: renders every decoded
 * location polygon on a single `<canvas>`, filled per the active
 * `MapLayer`, with pan/zoom and pointer hover/select resolved through a
 * spatial grid rather than per-element DOM nodes (SVG was rejected at
 * this feature's ~28,573-location scale — research.md §8).
 *
 * Pan/zoom state lives in a ref, not React state: it must survive a
 * layer switch or sidebar collapse/expand (spec FR-011, SC-002, SC-005)
 * without triggering React re-renders on every drag pixel — the canvas
 * redraw itself is imperative (see the draw() effect below), so nothing
 * is lost by keeping this out of the render cycle.
 */
export function MapCanvas({
  features,
  dataset,
  activeLayer,
  onHoverLocation,
  onSelectLocation,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1, initialized: false });
  const draggingRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const polygons = useMemo<Array<{ name: string; rings: Array<Array<[number, number]>> }>>(
    () =>
      features.map((f) => ({
        name: f.properties.name,
        rings: featureToRings(f.geometry),
      })),
    [features],
  );

  const hitTestIndex = useMemo(
    () => buildHitTestIndex(polygons as HitTestPolygon[]),
    [polygons],
  );

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }

    const view = viewRef.current;
    if (!view.initialized && cssWidth > 0 && cssHeight > 0) {
      view.scale = Math.min(cssWidth / WORLD_WIDTH, cssHeight / WORLD_HEIGHT);
      view.tx = (cssWidth - WORLD_WIDTH * view.scale) / 2;
      view.ty = (cssHeight - WORLD_HEIGHT * view.scale) / 2;
      view.initialized = true;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.tx, dpr * view.ty);

    // World-space line width that renders as a constant ~1 screen pixel
    // regardless of zoom (the transform above already bakes dpr*scale
    // into every drawn coordinate, so lineWidth needs the inverse to stay
    // visually constant rather than growing with zoom).
    ctx.lineWidth = BORDER_WIDTH_SCREEN_PX / (dpr * view.scale);
    ctx.strokeStyle = BORDER_COLOR;

    for (const polygon of polygons) {
      const row = dataset.get(polygon.name);
      const fill = row ? activeLayer.getFill(row, dataset) : NEUTRAL_COLOR;
      ctx.beginPath();
      for (const ring of polygon.rings) {
        ring.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = rgbToCss(fill);
      ctx.fill("evenodd");
      ctx.stroke();
    }
  };

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, dataset, activeLayer]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, dataset, activeLayer]);

  function screenToWorld(clientX: number, clientY: number): [number, number] {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return [(screenX - view.tx) / view.scale, (screenY - view.ty) / view.scale];
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    draggingRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const dragging = draggingRef.current;
    if (dragging && dragging.pointerId === e.pointerId) {
      const view = viewRef.current;
      view.tx += e.clientX - dragging.lastX;
      view.ty += e.clientY - dragging.lastY;
      dragging.lastX = e.clientX;
      dragging.lastY = e.clientY;
      draw();
      return;
    }
    if (onHoverLocation) {
      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const rect = canvasRef.current?.getBoundingClientRect();
      const position = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
      onHoverLocation(hitTestIndex.resolve(wx, wy), position);
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const dragging = draggingRef.current;
    if (dragging && dragging.pointerId === e.pointerId) {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      draggingRef.current = null;
    }
  }

  function handleClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!onSelectLocation) return;
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    onSelectLocation(hitTestIndex.resolve(wx, wy));
  }

  function handleWheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    const view = viewRef.current;
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * zoomFactor));
    view.tx -= wx * (nextScale - view.scale);
    view.ty -= wy * (nextScale - view.scale);
    view.scale = nextScale;
    draw();
  }

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => onHoverLocation?.(null, null)}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}
