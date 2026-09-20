// Compares two SaveInventory values, producing a DriftReport per
// data-model.md — the mechanism that answers this feature's own stated
// motivation ("this game is going to get updated like crazy").
import type { DriftReport, FieldInventoryEntry, SaveInventory } from "./types";

function flattenEntries(inventory: SaveInventory): Map<string, FieldInventoryEntry> {
  const byPath = new Map<string, FieldInventoryEntry>();
  for (const section of inventory.sections) {
    for (const entry of section.entries) {
      byPath.set(entry.path, entry);
    }
  }
  return byPath;
}

function sameTypes(a: FieldInventoryEntry["observedTypes"], b: FieldInventoryEntry["observedTypes"]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((type, i) => type === sortedB[i]);
}

/**
 * Diffs two `SaveInventory` values field-path by field-path.
 * `hasDrift` is always computed from `added`/`removed`/`typeChanged` —
 * never hand-set (data-model.md's Validation Rules) — so a "no drift"
 * result is always an explicit, deliberate `false`, not an empty or
 * ambiguous report (spec's Acceptance Scenario 3).
 */
export function diffSaveInventories(baseline: SaveInventory, candidate: SaveInventory): DriftReport {
  const baselineEntries = flattenEntries(baseline);
  const candidateEntries = flattenEntries(candidate);

  const added: string[] = [];
  const removed: string[] = [];
  const typeChanged: DriftReport["typeChanged"] = [];

  for (const [path, candidateEntry] of candidateEntries) {
    const baselineEntry = baselineEntries.get(path);
    if (!baselineEntry) {
      added.push(path);
    } else if (!sameTypes(baselineEntry.observedTypes, candidateEntry.observedTypes)) {
      typeChanged.push({ path, before: baselineEntry.observedTypes, after: candidateEntry.observedTypes });
    }
  }
  for (const path of baselineEntries.keys()) {
    if (!candidateEntries.has(path)) {
      removed.push(path);
    }
  }

  added.sort();
  removed.sort();
  typeChanged.sort((a, b) => a.path.localeCompare(b.path));

  return {
    baseline: { sourceFile: baseline.sourceFile, gameVersion: baseline.gameVersion },
    candidate: { sourceFile: candidate.sourceFile, gameVersion: candidate.gameVersion },
    added,
    removed,
    typeChanged,
    hasDrift: added.length > 0 || removed.length > 0 || typeChanged.length > 0,
  };
}
