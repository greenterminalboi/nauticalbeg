// One parent temp folder per test run for DuckDB test databases (see
// tests/helpers/duckdb-test-env.ts), removed when the run ends. vitest's
// forked workers don't reliably fire `process.on("exit")`, so per-worker
// cleanup leaked a folder per worker per run — ~3,200 of them had grown to
// 166GB and filled the disk during 015. globalSetup runs in the main
// process before workers fork, so the env var is inherited by all of them.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export default function setup(): () => void {
  const dir = mkdtempSync(path.join(tmpdir(), "nauticalbeg-test-run-"));
  process.env.NAUTICALBEG_TEST_TMP = dir;
  return () => rmSync(dir, { recursive: true, force: true });
}
