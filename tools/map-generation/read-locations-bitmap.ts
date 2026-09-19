// Decodes locations.png and groups its pixels by exact color into one
// LocationPixelRegion per NamedLocation (research.md §1).
//
// Rows are stored run-length-encoded (contiguous same-color x-ranges per
// row), not as a per-pixel Set — the real bitmap is ~134M pixels
// (research.md §1/§4), and painted regions are large solid blocks, so RLE
// keeps this tractable.

import type { LocationPixelRegion, NamedLocation, PixelRun } from "./types";

export interface DecodedBitmap {
  width: number;
  height: number;
  /** RGBA byte buffer, 4 bytes per pixel, row-major (pngjs's decoded shape). */
  data: Uint8Array | Buffer;
}

export function groupPixelsByColor(
  bitmap: DecodedBitmap,
  namedLocations: NamedLocation[],
): LocationPixelRegion[] {
  const nameByColorKey = new Map<number, string>();
  for (const loc of namedLocations) {
    nameByColorKey.set(colorKey(loc.color[0], loc.color[1], loc.color[2]), loc.name);
  }

  const rowsByName = new Map<string, Map<number, PixelRun[]>>();
  const { width, height, data } = bitmap;

  for (let y = 0; y < height; y++) {
    let runStartX = -1;
    let runName: string | undefined;

    const flushRun = (endXExclusive: number) => {
      if (runName === undefined || runStartX < 0) return;
      let rows = rowsByName.get(runName);
      if (!rows) {
        rows = new Map();
        rowsByName.set(runName, rows);
      }
      let runsThisRow = rows.get(y);
      if (!runsThisRow) {
        runsThisRow = [];
        rows.set(y, runsThisRow);
      }
      runsThisRow.push({ xStart: runStartX, xEnd: endXExclusive - 1 });
    };

    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const name = nameByColorKey.get(colorKey(data[idx], data[idx + 1], data[idx + 2]));

      if (name !== runName) {
        flushRun(x);
        runStartX = name === undefined ? -1 : x;
        runName = name;
      }
    }
    flushRun(width);
  }

  return [...rowsByName.entries()].map(([name, rows]) => ({ name, rows }));
}

function colorKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}
