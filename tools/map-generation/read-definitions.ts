// Parses definitions.txt's `region = { area = { province = { loc loc } } }`
// tree (research.md §1) into a flat province -> member-location-names list,
// discarding the region/area nesting at whatever depth it occurs (that
// nesting exists for the game's own UI grouping, not province identity).

import type { ProvinceGrouping } from "./types";

type Token = string;

type ParsedBlock =
  | { kind: "named"; entries: Array<{ name: string; body: ParsedBlock }> }
  | { kind: "leaf"; tokens: string[] };

function tokenize(content: string): Token[] {
  const withoutBom = content.replace(/^﻿/, "");
  // `#` starts a comment that runs to end-of-line (Clausewitz script
  // convention). MUST strip before tokenizing: a comment happening to
  // contain a stray `{`/`}` (confirmed in the real definitions.txt, e.g.
  // a commented-out `#some_province = { }`) would otherwise corrupt the
  // nesting-depth tracking below and silently truncate parsing partway
  // through the file.
  const withoutComments = withoutBom
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
  // `=` is always its own token, even with no surrounding whitespace (the
  // real file mixes `name = {` and `name= {` / `name={` — without this,
  // "name=" tokenizes as one bareToken and the "name = {" lookahead below
  // never matches, silently misclassifying real province/area entries as
  // bare tokens and corrupting the nesting-depth tracking).
  return withoutComments.match(/\{|\}|=|[^\s{}=]+/g) ?? [];
}

/**
 * Parses the token stream starting at `pos` (just inside a `{`, or file
 * start) until a matching `}` or EOF. A block whose body is purely bare
 * tokens (no `name = {`) is a leaf (a province's location-name list);
 * definitions.txt never mixes the two shapes at one nesting level.
 */
function parseBlock(tokens: Token[], pos: number): [ParsedBlock, number] {
  const entries: Array<{ name: string; body: ParsedBlock }> = [];
  const bareTokens: string[] = [];

  while (pos < tokens.length && tokens[pos] !== "}") {
    if (tokens[pos + 1] === "=" && tokens[pos + 2] === "{") {
      const name = tokens[pos];
      const [childBody, nextPos] = parseBlock(tokens, pos + 3);
      entries.push({ name, body: childBody });
      pos = nextPos;
    } else {
      bareTokens.push(tokens[pos]);
      pos++;
    }
  }
  const afterClosingBrace = pos + 1; // skip the "}" (or EOF, harmless if none)

  if (entries.length > 0) {
    return [{ kind: "named", entries }, afterClosingBrace];
  }
  return [{ kind: "leaf", tokens: bareTokens }, afterClosingBrace];
}

function flatten(block: ParsedBlock, out: ProvinceGrouping[]): void {
  if (block.kind === "leaf") return;
  for (const entry of block.entries) {
    if (entry.body.kind === "leaf") {
      out.push({ name: entry.name, locationNames: entry.body.tokens });
    } else {
      flatten(entry.body, out);
    }
  }
}

export function parseDefinitions(content: string): ProvinceGrouping[] {
  const tokens = tokenize(content);
  const [root] = parseBlock(tokens, 0);
  const result: ProvinceGrouping[] = [];
  flatten(root, result);
  return result;
}
