import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, checkDist } from "../../tools/check-dist/check-dist";

const GOOD_HEADERS = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
`;

/** A minimal deployable tree under this run's temp folder (tests/global-temp-dir.ts). */
function makeDist(): string {
  const root = process.env.NAUTICALBEG_TEST_TMP ?? tmpdir();
  const dir = mkdtempSync(path.join(root, "check-dist-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
  writeFileSync(path.join(dir, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(path.join(dir, "_headers"), GOOD_HEADERS);
  return dir;
}

describe("checkDist (016 contracts/pipeline.md)", () => {
  it("passes a clean build", () => {
    expect(checkDist(makeDist())).toEqual([]);
  });

  it("flags a file over 25 MiB by name", () => {
    const dir = makeDist();
    const big = path.join(dir, "assets", "duckdb-eh.wasm");
    // Sparse file: the right size without writing 26MB of data.
    const fd = openSync(big, "w");
    ftruncateSync(fd, MAX_FILE_BYTES + 1);
    closeSync(fd);
    const problems = checkDist(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(path.join("assets", "duckdb-eh.wasm"));
    expect(problems[0]).toContain("25 MiB");
  });

  it("allows a file exactly at the limit", () => {
    const dir = makeDist();
    const fd = openSync(path.join(dir, "map.topojson"), "w");
    ftruncateSync(fd, MAX_FILE_BYTES);
    closeSync(fd);
    expect(checkDist(dir)).toEqual([]);
  });

  it("flags image/texture files", () => {
    const dir = makeDist();
    writeFileSync(path.join(dir, "assets", "flag.PNG"), "x");
    writeFileSync(path.join(dir, "terrain.dds"), "x");
    const problems = checkDist(dir);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("flag.PNG");
    expect(problems.join("\n")).toContain("terrain.dds");
  });

  it("flags a missing _headers file", () => {
    const dir = makeDist();
    rmSync(path.join(dir, "_headers"));
    expect(checkDist(dir)).toEqual(["_headers is missing (it should be copied from public/_headers)."]);
  });

  it("flags an empty _headers file", () => {
    const dir = makeDist();
    writeFileSync(path.join(dir, "_headers"), "");
    expect(checkDist(dir)).toEqual([
      "_headers does not set Cross-Origin-Opener-Policy.",
      "_headers does not set Cross-Origin-Embedder-Policy.",
    ]);
  });

  it("flags a _headers file missing an isolation header", () => {
    const dir = makeDist();
    writeFileSync(path.join(dir, "_headers"), "/*\n  Cross-Origin-Opener-Policy: same-origin\n");
    expect(checkDist(dir)).toEqual(["_headers does not set Cross-Origin-Embedder-Policy."]);
  });

  it("reports a missing build directory", () => {
    expect(checkDist(path.join(tmpdir(), "nauticalbeg-no-such-dist"))[0]).toContain("does not exist");
  });
});
