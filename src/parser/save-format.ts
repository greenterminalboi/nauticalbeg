// Identifies which of the EU5 save encodings a file uses from its `SAV`
// header line (FR-001), before any parsing. Layout per jomini's envelope
// (rakaly/jomini crates/jomini/src/envelope/header.rs), confirmed on real
// saves — see specs/015-save-format-support/research.md §R1:
//
//   "SAV" | 2 hex: header version | 2 hex: kind | 8 bytes random |
//   8 hex: metadata length | optional 8 bytes padding | "\n"
//
// e.g. `SAV02009ce65dcc0004e3d100000000\n` (melted text, kind 00) and
// `SAV02039ce65dcc0006314700000000\n` (the game's normal save, kind 03).
import type { ErrorKind } from "./protocol";

/** The error kinds a header check alone can produce. */
export type HeaderErrorKind = Extract<ErrorKind, "not-a-save" | "damaged-save" | "unrecognized-format">;

export interface SaveFormat {
  headerVersion: number;
  kindCode: number;
  encoding: "text" | "binary";
  container: "plain" | "unified-zip" | "split-zip";
  metadataLength: number;
}

const KINDS: Record<number, Pick<SaveFormat, "encoding" | "container">> = {
  0: { encoding: "text", container: "plain" },
  1: { encoding: "binary", container: "plain" },
  2: { encoding: "text", container: "unified-zip" },
  3: { encoding: "binary", container: "unified-zip" },
  4: { encoding: "text", container: "split-zip" },
  5: { encoding: "binary", container: "split-zip" },
};

/** The literal bytes every real EU5 save starts with. */
export const SAVE_HEADER_PREFIX = "SAV";
const PREFIX_BYTES = new TextEncoder().encode(SAVE_HEADER_PREFIX);
const HEADER_MAX_BYTES = 33;
const HEX = /^[0-9a-fA-F]+$/;

export function looksLikeSaveFile(data: Uint8Array): boolean {
  if (data.length < PREFIX_BYTES.length) return false;
  return PREFIX_BYTES.every((byte, i) => data[i] === byte);
}

function hexField(data: Uint8Array, start: number, end: number): number | null {
  if (data.length < end) return null;
  const text = String.fromCharCode(...data.subarray(start, end));
  return HEX.test(text) ? parseInt(text, 16) : null;
}

/**
 * Validation order (data-model.md "SaveFormat"): not `SAV` → `not-a-save`;
 * unparseable hex fields or no `\n` within the first 33 bytes →
 * `damaged-save`; kind outside 0..5 → `unrecognized-format`.
 */
export function parseSaveHeader(
  data: Uint8Array,
): SaveFormat | { error: HeaderErrorKind } {
  if (!looksLikeSaveFile(data)) return { error: "not-a-save" };

  const newline = data.subarray(0, HEADER_MAX_BYTES).indexOf(0x0a);
  const headerVersion = hexField(data, 3, 5);
  const kindCode = hexField(data, 5, 7);
  const metadataLength = hexField(data, 15, 23);
  if (newline < 23 || headerVersion === null || kindCode === null || metadataLength === null) {
    return { error: "damaged-save" };
  }

  const kind = KINDS[kindCode];
  if (!kind) return { error: "unrecognized-format" };
  return { headerVersion, kindCode, metadataLength, ...kind };
}
