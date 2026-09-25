// Keeps the map's pan/zoom locked to the map itself: it can't be zoomed out
// smaller than the canvas, or panned past its own edges, so nothing but the
// map is ever visible (no empty background around it). Pure so it's
// unit-testable; MapCanvas.tsx applies it after every pan, zoom and resize.

export interface MapView {
  /** Screen-space offset of world (0, 0), in CSS pixels. */
  tx: number;
  ty: number;
  /** CSS pixels per world unit. */
  scale: number;
}

/** The smallest scale at which the world still covers the whole canvas. */
export function coverScale(
  cssWidth: number,
  cssHeight: number,
  worldWidth: number,
  worldHeight: number,
): number {
  return Math.max(cssWidth / worldWidth, cssHeight / worldHeight);
}

/**
 * Clamps `view` in place: scale to at least the cover scale (zooming about
 * the canvas center), then the offset so the world's edges never come
 * inside the canvas.
 */
export function clampView(
  view: MapView,
  cssWidth: number,
  cssHeight: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const minScale = coverScale(cssWidth, cssHeight, worldWidth, worldHeight);
  if (view.scale < minScale) {
    const cx = (cssWidth / 2 - view.tx) / view.scale;
    const cy = (cssHeight / 2 - view.ty) / view.scale;
    view.scale = minScale;
    view.tx = cssWidth / 2 - cx * minScale;
    view.ty = cssHeight / 2 - cy * minScale;
  }
  view.tx = Math.min(0, Math.max(cssWidth - worldWidth * view.scale, view.tx));
  view.ty = Math.min(0, Math.max(cssHeight - worldHeight * view.scale, view.ty));
}
