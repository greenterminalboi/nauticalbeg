import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { loadRulerHistory, suppressLeadingZeros } from "../../src/components/Overview/leaderboardData";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

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

describe("leaderboardData loadRulerHistory (Ruler History stretch goal)", () => {
  let db: SaveDatabase;
  const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
  const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("decodes each reign's start_date into a decimal year and sums adm+dip+mil into score", async () => {
    db = await openSaveDatabase("ruler-history-decode.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const byNation = await loadRulerHistory(db, [2025, 3]);
    const rus = byNation.get(2025)!;
    expect(rus).toHaveLength(2);
    // 1337.11.11 -> 1337 + 10/12 + 10/365.
    expect(rus[0].year).toBeCloseTo(1337 + 10 / 12 + 10 / 365, 5);
    expect(rus[0]).toMatchObject({ regnalNumber: 1, adm: 80, dip: 60, mil: 50, score: 190 });
    // 1400.1.1 -> exactly 1400 (no month/day offset).
    expect(rus[1].year).toBeCloseTo(1400, 5);
    expect(rus[1]).toMatchObject({ regnalNumber: 2, adm: 40, dip: 30, mil: 20, score: 90 });

    const sca = byNation.get(3)!;
    expect(sca).toHaveLength(1);
    expect(sca[0]).toMatchObject({ regnalNumber: 1, adm: 100, dip: 100, mil: 100, score: 300 });
  });

  it("scopes strictly to the requested nations, and an idx with no reigns is simply absent from the map", async () => {
    db = await openSaveDatabase("ruler-history-decode-scope.db");
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const byNation = await loadRulerHistory(db, [3]);
    expect(byNation.size).toBe(1);
    expect(byNation.has(2025)).toBe(false);
  });
});
