// Parses named_locations/*.txt (research.md §1): `name = rrggbb` per line.

import type { NamedLocation } from "./types";

const LINE_PATTERN = /^([A-Za-z0-9_]+)\s*=\s*([0-9a-fA-F]{1,6})$/;

export function parseNamedLocations(content: string): NamedLocation[] {
  const result: NamedLocation[] = [];
  // The real named_locations/00_default.txt starts with a UTF-8 BOM.
  const withoutBom = content.replace(/^﻿/, "");

  for (const rawLine of withoutBom.split("\n")) {
    // Many real lines carry a trailing `# comment` (a human-readable
    // real-world place name) after the color value — strip it before
    // matching, or every such line silently fails the `$`-anchored
    // pattern and gets dropped (confirmed against the real install: ~5.9k
    // of ~28.2k named locations carry one of these comments).
    const withoutComment = rawLine.replace(/#.*$/, "");
    const line = withoutComment.trim();
    if (line === "") continue;

    const match = LINE_PATTERN.exec(line);
    if (!match) continue;

    const [, name, hex] = match;
    const padded = hex.padStart(6, "0");
    const r = parseInt(padded.slice(0, 2), 16);
    const g = parseInt(padded.slice(2, 4), 16);
    const b = parseInt(padded.slice(4, 6), 16);
    result.push({ name, color: [r, g, b] });
  }

  return result;
}
