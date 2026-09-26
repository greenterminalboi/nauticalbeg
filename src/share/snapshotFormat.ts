// The container a shared game travels in (017, contracts/snapshot-format.md):
//
//   "NBSNAP" | u16 LE format version | u32 LE manifest length M |
//   manifest (UTF-8 JSON, M bytes) | one Arrow IPC stream per table, in
//   manifest order, each exactly tables[i].bytes long.
//
// The whole container is Brotli-compressed before upload. Shared data is
// untrusted input (spec FR-012), so decoding checks every length before
// slicing and fails with a typed error instead of guessing (constitution III).

export const SNAPSHOT_FORMAT_VERSION = 1;
/** Uncompressed container ceiling, a guard against decompression bombs. */
export const MAX_SNAPSHOT_BYTES = 1024 * 1024 * 1024;

const MAGIC = new TextEncoder().encode("NBSNAP");
const HEADER_BYTES = MAGIC.length + 2 + 4;

export interface SnapshotTable {
  name: string;
  rows: number;
  bytes: number;
  columns: string[];
}

export interface SnapshotManifest {
  appVersion: string;
  createdAt: string;
  summary: { inGameDate: string; playerNationTag: string };
  tables: SnapshotTable[];
}

export type SnapshotErrorKind = "corrupt" | "incompatible";

export class SnapshotError extends Error {
  constructor(
    readonly kind: SnapshotErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

export function encodeSnapshot(manifest: SnapshotManifest, streams: Uint8Array[]): Uint8Array {
  if (streams.length !== manifest.tables.length) {
    throw new Error("encodeSnapshot: one stream per manifest table is required");
  }
  streams.forEach((s, i) => {
    if (s.length !== manifest.tables[i].bytes) {
      throw new Error(`encodeSnapshot: stream ${manifest.tables[i].name} length doesn't match the manifest`);
    }
  });
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const total = HEADER_BYTES + json.length + streams.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint16(MAGIC.length, SNAPSHOT_FORMAT_VERSION, true);
  view.setUint32(MAGIC.length + 2, json.length, true);
  out.set(json, HEADER_BYTES);
  let offset = HEADER_BYTES + json.length;
  for (const s of streams) {
    out.set(s, offset);
    offset += s.length;
  }
  return out;
}

function corrupt(message: string): SnapshotError {
  return new SnapshotError("corrupt", message);
}

function isManifest(value: unknown): value is SnapshotManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  const summary = m.summary as Record<string, unknown> | undefined;
  return (
    typeof m.appVersion === "string" &&
    typeof m.createdAt === "string" &&
    typeof summary === "object" &&
    summary !== null &&
    typeof summary.inGameDate === "string" &&
    typeof summary.playerNationTag === "string" &&
    Array.isArray(m.tables) &&
    m.tables.every((t: unknown) => {
      const table = t as Record<string, unknown>;
      return (
        typeof table === "object" &&
        table !== null &&
        typeof table.name === "string" &&
        Number.isSafeInteger(table.rows) &&
        (table.rows as number) >= 0 &&
        Number.isSafeInteger(table.bytes) &&
        (table.bytes as number) >= 0 &&
        Array.isArray(table.columns) &&
        table.columns.every((c) => typeof c === "string")
      );
    })
  );
}

export function decodeSnapshot(bytes: Uint8Array): { manifest: SnapshotManifest; streams: Uint8Array[] } {
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw corrupt("Shared game is larger than the size limit.");
  if (bytes.length < HEADER_BYTES) throw corrupt("Shared game data is truncated.");
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw corrupt("Not a NauticalBeg shared game.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(MAGIC.length, true);
  if (version !== SNAPSHOT_FORMAT_VERSION) {
    throw new SnapshotError("incompatible", `Unsupported shared-game format version ${version}.`);
  }
  const manifestLength = view.getUint32(MAGIC.length + 2, true);
  const manifestEnd = HEADER_BYTES + manifestLength;
  if (manifestEnd > bytes.length) throw corrupt("Shared game manifest is truncated.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(HEADER_BYTES, manifestEnd)));
  } catch {
    throw corrupt("Shared game manifest is unreadable.");
  }
  if (!isManifest(parsed)) throw corrupt("Shared game manifest is malformed.");

  const declared = parsed.tables.reduce((n, t) => n + t.bytes, 0);
  if (declared > MAX_SNAPSHOT_BYTES) throw corrupt("Shared game is larger than the size limit.");
  if (manifestEnd + declared !== bytes.length) {
    throw corrupt(
      manifestEnd + declared > bytes.length ? "Shared game data is truncated." : "Shared game has unexpected trailing data.",
    );
  }

  const streams: Uint8Array[] = [];
  let offset = manifestEnd;
  for (const t of parsed.tables) {
    streams.push(bytes.subarray(offset, offset + t.bytes));
    offset += t.bytes;
  }
  return { manifest: parsed, streams };
}
