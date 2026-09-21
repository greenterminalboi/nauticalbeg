// specs/010-societal-values-compass: decoded, in-memory form of
// listSocietalValuesArrow's Arrow IPC result — mirrors marketData.ts's
// direct-decode-via-apache-arrow pattern.
import { tableFromIPC } from "apache-arrow";
import { listSocietalValuesArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import type { AxisReading } from "./compassPosition";

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

/** Every country's applicable axis readings, grouped by nation_idx. A
 * nation with no entry here has zero applicable axes (spec FR-015). */
export async function decodeSocietalValuesByNation(
  db: SaveDatabase,
): Promise<Map<number, AxisReading[]>> {
  const rows = decodeRows(await listSocietalValuesArrow(db));
  const byNation = new Map<number, AxisReading[]>();
  for (const r of rows) {
    const nationIdx = typeof r.nation_idx === "number" ? r.nation_idx : Number(r.nation_idx);
    const axis = String(r.axis);
    const value = typeof r.value === "number" ? r.value : Number(r.value);
    const existing = byNation.get(nationIdx);
    if (existing) {
      existing.push({ axis, value });
    } else {
      byNation.set(nationIdx, [{ axis, value }]);
    }
  }
  return byNation;
}
