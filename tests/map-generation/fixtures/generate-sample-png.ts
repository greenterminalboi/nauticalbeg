// One-off generator for sample.png (run manually if the fixture ever needs
// to be regenerated: `npx tsx tests/map-generation/fixtures/generate-sample-png.ts`).
// Committed alongside sample.png so the fixture's exact pixel layout stays
// documented and reproducible rather than being an opaque binary.
//
// Layout (20x10, background = dark gray, unpainted):
//   alpha (255,0,0):  x[0-4]  y[0-4]  — one contiguous 5x5 block
//   beta  (0,255,0):  x[5-9]  y[0-4]  — contiguous block, touches alpha's
//                                       right edge (union of alpha+beta is
//                                       one 10x5 contiguous region)
//   gamma (0,0,255):  x[0-2]  y[5-7]  AND x[15-17] y[5-7] — same color,
//                                       two disjoint 3x3 blobs (exercises
//                                       the MultiPolygon / disjoint-region
//                                       case end to end)
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const WIDTH = 20;
const HEIGHT = 10;
const BACKGROUND: [number, number, number] = [20, 20, 20];

const png = new PNG({ width: WIDTH, height: HEIGHT });

function setPixel(x: number, y: number, [r, g, b]: readonly [number, number, number]): void {
  const idx = (WIDTH * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = 255;
}

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    setPixel(x, y, BACKGROUND);
  }
}

for (let y = 0; y <= 4; y++) {
  for (let x = 0; x <= 4; x++) setPixel(x, y, [255, 0, 0]); // alpha
  for (let x = 5; x <= 9; x++) setPixel(x, y, [0, 255, 0]); // beta
}

for (let y = 5; y <= 7; y++) {
  for (let x = 0; x <= 2; x++) setPixel(x, y, [0, 0, 255]); // gamma blob 1
  for (let x = 15; x <= 17; x++) setPixel(x, y, [0, 0, 255]); // gamma blob 2
}

const outPath = join(import.meta.dirname, "sample.png");
writeFileSync(outPath, PNG.sync.write(png));
console.log(`wrote ${outPath}`);
