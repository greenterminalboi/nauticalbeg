// Parses one category's `.txt` definition files into RawEntry records,
// reusing this project's existing `jomini` dependency (research.md §1 —
// same Clausewitz script grammar `src/parser/version-adapters/1.3.11.ts`
// already parses for saves). A file that fails to parse is skipped and
// recorded, never aborting the run (FR-013; research.md §1's empirical
// note on how rarely jomini actually throws).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";
import type { EntryFieldValue, EntrySource, ParseSkip, RawEntry } from "./types";

const README_RE = /readme/i;

function toFieldValue(value: unknown): EntryFieldValue {
  if (Array.isArray(value)) {
    return value.map(toFieldValue);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, EntryFieldValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toFieldValue(v);
    }
    return out;
  }
  // jomini's `unquoted` type narrowing already yields string/number/boolean;
  // anything else (e.g. undefined/null) is represented as an empty string
  // rather than dropped, so no field silently disappears.
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return "";
}

let parserPromise: ReturnType<typeof Jomini.initialize> | undefined;
async function getParser() {
  parserPromise ??= Jomini.initialize();
  return parserPromise;
}

/**
 * Parses every `.txt` file in `categoryDir` (skipping readme files) as
 * one category's definitions. Each top-level `key = { ...fields }` block
 * becomes one RawEntry; a top-level key whose value isn't a record is
 * skipped (not a definition entry). Returns both the entries found and
 * any file-level skips, so the caller can record them without either
 * silently dropping data or aborting the run.
 */
export async function parseDefinitionCategory(
  categoryDir: string,
  categoryId: string,
  source: EntrySource,
): Promise<{ entries: RawEntry[]; skips: ParseSkip[] }> {
  const parser = await getParser();
  const entries: RawEntry[] = [];
  const skips: ParseSkip[] = [];

  let files: string[];
  try {
    files = readdirSync(categoryDir).filter((f) => f.endsWith(".txt") && !README_RE.test(f));
  } catch (err) {
    skips.push({ file: categoryDir, reason: `Cannot read directory: ${(err as Error).message}` });
    return { entries, skips };
  }

  for (const file of files) {
    const filePath = join(categoryDir, file);
    let text: string;
    try {
      text = readFileSync(filePath, "utf-8");
    } catch (err) {
      skips.push({ file: filePath, reason: `Cannot read file: ${(err as Error).message}` });
      continue;
    }

    let root: Record<string, unknown>;
    try {
      root = parser.parseText(text, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
    } catch (err) {
      skips.push({ file: filePath, reason: `Parse error: ${(err as Error).message}` });
      continue;
    }

    for (const [key, value] of Object.entries(root)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        // Not a `key = { ... }` definition block — nothing to skip-and-
        // record for (not a file-level failure), just not an entry.
        continue;
      }
      const fields: Record<string, EntryFieldValue> = {};
      for (const [fieldKey, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        fields[fieldKey] = toFieldValue(fieldValue);
      }
      entries.push({ category: categoryId, key, fields, source });
    }
  }

  return { entries, skips };
}
