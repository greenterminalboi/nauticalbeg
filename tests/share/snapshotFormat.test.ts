import { describe, expect, it } from "vitest";
import {
  decodeSnapshot,
  encodeSnapshot,
  MAX_SNAPSHOT_BYTES,
  SnapshotError,
  type SnapshotManifest,
} from "../../src/share/snapshotFormat";

const manifest: SnapshotManifest = {
  appVersion: "test",
  createdAt: "2026-09-25T15:00:00.000Z",
  summary: { inGameDate: "1657.1.3", playerNationTag: "MOR" },
  tables: [
    { name: "a", rows: 1, bytes: 3, columns: ["x"] },
    { name: "b", rows: 2, bytes: 2, columns: ["y", "z"] },
  ],
};
const streams = [new Uint8Array([1, 2, 3]), new Uint8Array([9, 8])];

function kindOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof SnapshotError ? e.kind : "other";
  }
}

describe("snapshot container (017 contracts/snapshot-format.md)", () => {
  it("round-trips the manifest and every stream", () => {
    const out = decodeSnapshot(encodeSnapshot(manifest, streams));
    expect(out.manifest).toEqual(manifest);
    expect(out.streams.map((s) => [...s])).toEqual([[1, 2, 3], [9, 8]]);
  });

  it("lays out magic, u16 LE version and u32 LE manifest length at fixed offsets", () => {
    const bytes = encodeSnapshot(manifest, streams);
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("NBSNAP");
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint16(6, true)).toBe(1);
    const m = view.getUint32(8, true);
    expect(JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + m)))).toEqual(manifest);
    expect(bytes.length).toBe(12 + m + 5);
  });

  it("refuses to encode when stream lengths don't match the manifest", () => {
    expect(() => encodeSnapshot(manifest, [new Uint8Array(1), new Uint8Array(2)])).toThrow();
  });

  it("reports corrupt input: wrong magic", () => {
    const bytes = encodeSnapshot(manifest, streams);
    bytes[0] = 0x58;
    expect(kindOf(() => decodeSnapshot(bytes))).toBe("corrupt");
  });

  it("reports corrupt input: truncated header or manifest", () => {
    const bytes = encodeSnapshot(manifest, streams);
    expect(kindOf(() => decodeSnapshot(bytes.slice(0, 10)))).toBe("corrupt");
    expect(kindOf(() => decodeSnapshot(bytes.slice(0, 20)))).toBe("corrupt");
  });

  it("reports corrupt input: invalid manifest JSON", () => {
    const bytes = encodeSnapshot(manifest, streams);
    bytes[12] = 0x7d; // "}" where "{" should be
    expect(kindOf(() => decodeSnapshot(bytes))).toBe("corrupt");
  });

  it("reports corrupt input: a stream running past the end, or trailing bytes", () => {
    const bytes = encodeSnapshot(manifest, streams);
    expect(kindOf(() => decodeSnapshot(bytes.slice(0, bytes.length - 1)))).toBe("corrupt");
    const longer = new Uint8Array(bytes.length + 1);
    longer.set(bytes);
    expect(kindOf(() => decodeSnapshot(longer))).toBe("corrupt");
  });

  it("reports corrupt input: a manifest whose tables claim more than the size limit", () => {
    const huge = { ...manifest, tables: [{ name: "a", rows: 1, bytes: MAX_SNAPSHOT_BYTES + 1, columns: [] }] };
    const bytes = encodeSnapshot({ ...manifest, tables: [] }, []);
    // Hand-build a header whose manifest claims an oversize table.
    const json = new TextEncoder().encode(JSON.stringify(huge));
    const forged = new Uint8Array(12 + json.length);
    forged.set(bytes.slice(0, 8));
    new DataView(forged.buffer).setUint32(8, json.length, true);
    forged.set(json, 12);
    expect(kindOf(() => decodeSnapshot(forged))).toBe("corrupt");
  });

  it("reports an unknown format version as incompatible, not corrupt", () => {
    const bytes = encodeSnapshot(manifest, streams);
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(6, 2, true);
    expect(kindOf(() => decodeSnapshot(bytes))).toBe("incompatible");
  });
});
