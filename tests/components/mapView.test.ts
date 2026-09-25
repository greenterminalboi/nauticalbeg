import { describe, expect, it } from "vitest";
import { clampView, coverScale } from "../../src/components/Overview/mapView";

// World is 360x180 (2:1), like MapCanvas.tsx.
const W = 360;
const H = 180;

describe("coverScale", () => {
  it("fills the wider dimension relative to the world's aspect ratio", () => {
    expect(coverScale(1000, 300, W, H)).toBeCloseTo(1000 / 360); // wide canvas: width wins
    expect(coverScale(400, 400, W, H)).toBeCloseTo(400 / 180); // square canvas: height wins
  });
});

describe("clampView (map never shows empty space)", () => {
  it("zooming out past the map stops at the cover scale, keeping the center", () => {
    const view = { tx: 450, ty: 100, scale: 0.5 }; // world (100, 100) at the canvas center
    clampView(view, 1000, 600, W, H);
    expect(view.scale).toBeCloseTo(600 / 180);
    // The world's edges stay outside the canvas on every side.
    expect(view.tx).toBeLessThanOrEqual(0);
    expect(view.ty).toBeLessThanOrEqual(0);
    expect(view.tx + W * view.scale).toBeGreaterThanOrEqual(1000);
    expect(view.ty + H * view.scale).toBeGreaterThanOrEqual(600);
  });

  it("panning past the left/top edge stops at the edge", () => {
    const view = { tx: 250, ty: 80, scale: 5 };
    clampView(view, 1000, 600, W, H);
    expect(view).toEqual({ tx: 0, ty: 0, scale: 5 });
  });

  it("panning past the right/bottom edge stops at the edge", () => {
    const view = { tx: -5000, ty: -5000, scale: 5 };
    clampView(view, 1000, 600, W, H);
    expect(view.tx).toBe(1000 - W * 5);
    expect(view.ty).toBe(600 - H * 5);
  });

  it("leaves a view that's already inside the map untouched", () => {
    const view = { tx: -300, ty: -200, scale: 5 };
    clampView(view, 1000, 600, W, H);
    expect(view).toEqual({ tx: -300, ty: -200, scale: 5 });
  });

  it("re-clamps when the canvas grows (e.g. the sidebar collapses)", () => {
    const view = { tx: 0, ty: 0, scale: 1000 / 360 }; // exactly covers a 1000px-wide canvas
    clampView(view, 1400, 600, W, H);
    expect(view.scale).toBeCloseTo(1400 / 360);
    expect(view.tx + W * view.scale).toBeGreaterThanOrEqual(1400 - 1e-9);
  });
});
