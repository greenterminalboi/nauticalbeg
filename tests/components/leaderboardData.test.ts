import { describe, expect, it } from "vitest";
import { suppressLeadingZeros } from "../../src/components/Overview/leaderboardData";

describe("leaderboardData suppressLeadingZeros (research.md §8)", () => {
  it("removes a leading run of zero-valued entries up to the first non-zero entry", () => {
    const points = [
      { year: 1337, value: 0 },
      { year: 1338, value: 0 },
      { year: 1339, value: 39.18862 },
      { year: 1340, value: 39.55171 },
    ];
    expect(suppressLeadingZeros(points)).toEqual([
      { year: 1339, value: 39.18862 },
      { year: 1340, value: 39.55171 },
    ]);
  });

  it("leaves a real zero appearing after the line has already started untouched", () => {
    const points = [
      { year: 1337, value: 10 },
      { year: 1338, value: 0 },
      { year: 1339, value: 5 },
    ];
    expect(suppressLeadingZeros(points)).toEqual(points);
  });

  it("is a no-op on a series that never starts at zero", () => {
    const points = [
      { year: 1337, value: 1.5 },
      { year: 1338, value: 2.5 },
    ];
    expect(suppressLeadingZeros(points)).toEqual(points);
  });

  it("returns an empty array for an all-zero series", () => {
    const points = [
      { year: 1337, value: 0 },
      { year: 1338, value: 0 },
    ];
    expect(suppressLeadingZeros(points)).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(suppressLeadingZeros([])).toEqual([]);
  });
});
