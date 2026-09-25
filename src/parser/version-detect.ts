// Detects the EU5 game version a save was created with (FR-004), using
// jomini (see version-adapters/1.3.11.ts for why: MIT-licensed, WASM,
// purpose-built for this exact format — replaced our original hand-rolled
// tokenizer in clausewitz.ts).
import { Jomini } from "jomini";

// Header helpers moved to save-format.ts in 015; re-exported so existing
// imports keep working.
export { SAVE_HEADER_PREFIX, looksLikeSaveFile } from "./save-format";

/**
 * Returns the save's `metadata.version` string (e.g. `"1.3.11"`), or
 * `null` if the document parses fine but has no recognizable version
 * field (a caller should treat that as FR-004's "unsupported version"
 * case). Deliberately does NOT catch jomini's own parse errors here —
 * jomini requires the *whole* document to be structurally well-formed
 * even to extract one field via a pointer, so a genuinely malformed/
 * truncated save throws here rather than returning null. Letting that
 * propagate (rather than converting it to null) matters: load-save.ts's
 * caller treats a thrown error as FR-009's "parse-failed" (corrupted
 * file), which is the accurate category — collapsing it into "no version
 * found" would misreport real corruption as merely "unrecognized version".
 *
 * `typeNarrowing: "unquoted"` matters here: with the default ("all"),
 * jomini's date-detection heuristic misfires on a quoted 3-part version
 * string like `"1.3.11"` (mistaking it for a date and returning a
 * nonsensical `Date`, confirmed against the real save) — restricting
 * narrowing to unquoted values only avoids that, while still correctly
 * narrowing the genuinely-unquoted `date=1628.8.14` field elsewhere.
 */
export async function detectVersion(data: Uint8Array): Promise<string | null> {
  const parser = await Jomini.initialize();
  const version = parser.parseText(
    data,
    { typeNarrowing: "unquoted" },
    (query) => query.at("/metadata/version"),
  );
  return typeof version === "string" ? version : null;
}
