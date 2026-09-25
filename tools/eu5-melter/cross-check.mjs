#!/usr/bin/env node
// Melter vs rakaly cross-check (quickstart.md §4; research R3-R5).
//
//   rakaly melt --to-stdout "$SAVE" > /tmp/r.eu5
//   node tools/eu5-melter/cross-check.mjs "$SAVE" /tmp/r.eu5
//
// Melts SAVE with the committed WASM + token table (+ version overrides,
// chosen by the save's own metadata.version exactly like melt.ts does),
// then compares it line by line against rakaly's melt and reports every
// line whose KEY differs. Quoting-only differences (tag="location" vs
// tag=location) are ignored. Exit code 1 if any key differs — each one is
// either a new entry for src/parser/melter/token-overrides.ts or a token
// table bug. Run whenever the token table, overrides, or a supported game
// version changes.
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as g from "../../src/parser/melter/generated/eu5_melter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [savePath, rakalyPath] = process.argv.slice(2);
if (!savePath || !rakalyPath) {
  console.error("usage: cross-check.mjs <save.eu5> <rakaly-melted.eu5>");
  process.exit(2);
}

g.initSync({ module: readFileSync(path.join(root, "src/parser/melter/generated/eu5_melter_bg.wasm")) });
const tokens = readFileSync(path.join(root, "public/tokens/eu5.flat"));
// token-overrides.ts is TS; its data is tiny, so read it textually.
const overridesSrc = readFileSync(path.join(root, "src/parser/melter/token-overrides.ts"), "utf8");
const save = readFileSync(savePath);

const base = g.create_resolver(tokens, new Uint32Array(), []);
const meta = new TextDecoder().decode(g.melt_metadata(save, base));
const version = meta.match(/version="([^"]+)"/)?.[1] ?? null;
const block = version && overridesSrc.split(`"${version}": {`)[1]?.split("}")[0];
const overrides = block ? [...block.matchAll(/0x([0-9a-f]+):\s*"([^"]+)"/gi)].map((m) => [parseInt(m[1], 16), m[2]]) : [];
console.error(`game version ${version}; overrides: ${JSON.stringify(overrides)}`);

const resolver = g.create_resolver(tokens, Uint32Array.from(overrides.map((o) => o[0])), overrides.map((o) => o[1]));
const chunks = [];
const stats = g.melt(save, resolver, (c) => (chunks.push(Buffer.from(c)), true));
// ~650MB exceeds V8's max string length, so walk the buffer line by line.
const buf = Buffer.concat(chunks);
chunks.length = 0;
let pos = 0;
function nextLine() {
  if (pos > buf.length) return null;
  let end = buf.indexOf(10, pos);
  if (end === -1) end = buf.length;
  const line = buf.toString("utf8", pos, end);
  pos = end + 1;
  return line;
}
console.error(`melted: ${buf.length} bytes, unknown tokens ${stats.unknown_tokens}, unknown lookups ${stats.unknown_lookups}`);

const keyOf = (line) => {
  const eq = line.indexOf("=");
  return eq === -1 ? null : line.slice(0, eq).trim().replace(/^"|"$/g, "");
};
const diffs = new Map();
let i = 0;
for await (const theirs of createInterface({ input: createReadStream(rakalyPath) })) {
  const mine = nextLine() ?? "";
  if (++i === 1) continue; // SAV header line (metadata length differs)
  const a = keyOf(mine), b = keyOf(theirs);
  if (a !== b) diffs.set(`${a} | ${b}`, (diffs.get(`${a} | ${b}`) ?? 0) + 1);
}
const leftover = pos < buf.length ? buf.subarray(pos).toString("utf8").split("\n").filter(Boolean).length : 0;
if (leftover > 0) diffs.set(`${leftover} extra lines | end of file`, 1);

if (diffs.size === 0) {
  console.log("OK — no key-name differences vs rakaly");
} else {
  console.log("key-name differences (ours | rakaly): count");
  for (const [k, n] of [...diffs].sort((x, y) => y[1] - x[1])) console.log(`  ${k}: ${n}`);
  process.exit(1);
}
