// Merges every localization `.yml` file under a game install's
// `localization/english/` directories into one global key -> {name,
// description} map. A dedicated regex-based parser, not a generic YAML
// library, because Paradox's loc format isn't strict YAML and keys
// aren't filename-scoped to any category (research.md §2).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LocalizationEntry, LocalizationMap } from "./types";

const LOC_LINE_RE = /^\s*([A-Za-z0-9_.]+)\s*:\s*\d*\s*"((?:[^"\\]|\\.)*)"/;
const DESC_SUFFIX = "_desc";

function unescape(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n");
}

/** Recursively finds every `*_l_english.yml` file under `root`. */
function findEnglishLocFiles(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...findEnglishLocFiles(full));
    } else if (entry.endsWith("_l_english.yml") && full.includes("localization/english")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Parses every `localization/english/*_l_english.yml` file found under
 * `installRoot` into one global key -> {name, description} map. A key
 * with no `_desc` companion gets `description: null`; a key that only
 * ever appears as a `_desc` suffix (no bare key) is not itself an entry.
 */
export function parseLocalization(installRoot: string): LocalizationMap {
  const files = findEnglishLocFiles(installRoot);
  const names = new Map<string, string>();
  const descriptions = new Map<string, string>();

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = LOC_LINE_RE.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = unescape(rawValue);
      if (key.endsWith(DESC_SUFFIX)) {
        descriptions.set(key.slice(0, -DESC_SUFFIX.length), value);
      } else {
        names.set(key, value);
      }
    }
  }

  const merged: LocalizationMap = new Map();
  const allKeys = new Set([...names.keys(), ...descriptions.keys()]);
  for (const key of allKeys) {
    const entry: LocalizationEntry = {
      name: names.get(key) ?? null,
      description: descriptions.get(key) ?? null,
    };
    merged.set(key, entry);
  }
  return merged;
}
