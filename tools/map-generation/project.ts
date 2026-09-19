// Pixel (x, y) -> equirectangular [longitude, latitude] (research.md §3).

export function projectPixel(
  x: number,
  y: number,
  bitmapWidth: number,
  bitmapHeight: number,
): [number, number] {
  const lon = (x / bitmapWidth) * 360 - 180;
  const lat = 90 - (y / bitmapHeight) * 180;
  return [lon, lat];
}
