import { describe, expect, it } from "vitest";
import { parseSaveHeader } from "../../src/parser/save-format";
import { toBytes } from "../helpers/encode";

// Real header lines, copied from the two real saves this feature was
// verified against (research.md §R1).
const MELTED_TEXT = "SAV02009ce65dcc0004e3d100000000\nmetadata={}";
const GAME_BINARY_ZIP = "SAV02039ce65dcc0006314700000000\n";

function withKind(kind: string): string {
  return MELTED_TEXT.slice(0, 5) + kind + MELTED_TEXT.slice(7);
}

describe("parseSaveHeader", () => {
  it("recognizes an uncompressed text save (kind 00)", () => {
    expect(parseSaveHeader(toBytes(MELTED_TEXT))).toEqual({
      headerVersion: 2,
      kindCode: 0,
      encoding: "text",
      container: "plain",
      metadataLength: 0x0004e3d1,
    });
  });

  it("recognizes the game's normal compressed binary save (kind 03)", () => {
    expect(parseSaveHeader(toBytes(GAME_BINARY_ZIP))).toMatchObject({
      kindCode: 3,
      encoding: "binary",
      container: "unified-zip",
      metadataLength: 0x00063147,
    });
  });

  it.each([
    ["01", "binary", "plain"],
    ["02", "text", "unified-zip"],
    ["04", "text", "split-zip"],
    ["05", "binary", "split-zip"],
  ])("maps kind %s to %s / %s", (kind, encoding, container) => {
    expect(parseSaveHeader(toBytes(withKind(kind)))).toMatchObject({ encoding, container });
  });

  it("rejects an unknown kind as unrecognized-format", () => {
    expect(parseSaveHeader(toBytes(withKind("06")))).toEqual({ error: "unrecognized-format" });
  });

  it("rejects non-hex header fields as damaged-save", () => {
    expect(parseSaveHeader(toBytes("SAV0Z009ce65dcc0004e3d100000000\n"))).toEqual({ error: "damaged-save" });
    expect(parseSaveHeader(toBytes("SAV02009ce65dcc0004e3dXYZ000000\n"))).toEqual({ error: "damaged-save" });
  });

  it("rejects a header with no newline in the first 33 bytes as damaged-save", () => {
    expect(parseSaveHeader(toBytes("SAV02009ce65dcc0004e3d1000000000000000000"))).toEqual({ error: "damaged-save" });
    expect(parseSaveHeader(toBytes("SAV0200"))).toEqual({ error: "damaged-save" });
  });

  it("rejects non-save input as not-a-save", () => {
    expect(parseSaveHeader(toBytes("PK\u0003\u0004 a zip file"))).toEqual({ error: "not-a-save" });
    expect(parseSaveHeader(new Uint8Array())).toEqual({ error: "not-a-save" });
  });
});
