// Node has no dev server to fetch the melter WASM / token table from, so
// tests hand melt.ts the committed bytes directly (see
// src/parser/melter/melt.ts's `configureMelterAssetsForTesting`).
import { readFileSync } from "node:fs";
import path from "node:path";
import { configureMelterAssetsForTesting } from "../../src/parser/melter/melt";

const root = process.cwd();

export function readFixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(path.resolve(root, "tests/fixtures", name)));
}

export function ensureTestMelterConfigured(): void {
  configureMelterAssetsForTesting(async () => ({
    wasm: new Uint8Array(readFileSync(path.resolve(root, "src/parser/melter/generated/eu5_melter_bg.wasm"))),
    tokens: new Uint8Array(readFileSync(path.resolve(root, "public/tokens/eu5.flat"))),
  }));
}
