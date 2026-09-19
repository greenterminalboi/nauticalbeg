import { describe, expect, it } from "vitest";
import { projectPixel } from "../../tools/map-generation/project";

describe("project projectPixel", () => {
  it("maps the top-left pixel corner to (-180, 90)", () => {
    expect(projectPixel(0, 0, 16384, 8192)).toEqual([-180, 90]);
  });

  it("maps the center pixel to (0, 0)", () => {
    expect(projectPixel(8192, 4096, 16384, 8192)).toEqual([0, 0]);
  });

  it("maps the bottom-right corner to (180, -90)", () => {
    expect(projectPixel(16384, 8192, 16384, 8192)).toEqual([180, -90]);
  });

  it("is parameterized on width/height rather than hardcoded to the real bitmap size", () => {
    // A tiny 20x10 bitmap (matches this feature's own test fixture dimensions)
    expect(projectPixel(0, 0, 20, 10)).toEqual([-180, 90]);
    expect(projectPixel(10, 5, 20, 10)).toEqual([0, 0]);
    expect(projectPixel(20, 10, 20, 10)).toEqual([180, -90]);
  });
});
