// Turns the loaded game's database into a snapshot container (017,
// contracts/snapshot-format.md). Runs against the app's read connection:
// DuckDB-Wasm executes queries in its own worker, so the UI isn't blocked.
import { queryArrowIPC, queryRows, type SaveDatabase } from "../storage/db";
import { getPlayerNationOverview, getSaveMeta } from "../storage/queries";
import { encodeSnapshot, type SnapshotManifest, type SnapshotTable } from "./snapshotFormat";

/** Never shared (spec FR-003): parts of the save the app doesn't display. */
const EXCLUDED_TABLES = new Set(["raw_sections"]);

/** What `save_meta` looks like to a viewer: no file name, not kept. */
const SAVE_META_SELECT = "SELECT * REPLACE ('Shared game' AS filename, 0 AS kept) FROM save_meta";

export async function exportSnapshot(
  db: SaveDatabase,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const tableRows = await queryRows(
    db,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const names = tableRows.map((r) => String(r.table_name)).filter((n) => !EXCLUDED_TABLES.has(n));

  const columnRows = await queryRows(
    db,
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'main' ORDER BY table_name, ordinal_position",
  );
  const columnsByTable = new Map<string, string[]>();
  for (const r of columnRows) {
    const list = columnsByTable.get(String(r.table_name)) ?? [];
    list.push(String(r.column_name));
    columnsByTable.set(String(r.table_name), list);
  }

  const tables: SnapshotTable[] = [];
  const streams: Uint8Array[] = [];
  for (const [i, name] of names.entries()) {
    const sql = name === "save_meta" ? SAVE_META_SELECT : `SELECT * FROM ${name}`;
    const ipc = new Uint8Array(await queryArrowIPC(db, sql));
    const [{ n }] = await queryRows(db, `SELECT count(*) AS n FROM ${name}`);
    tables.push({ name, rows: Number(n), bytes: ipc.length, columns: columnsByTable.get(name) ?? [] });
    streams.push(ipc);
    onProgress?.(i + 1, names.length);
  }

  const meta = await getSaveMeta(db);
  const playerNationTag = await getPlayerNationOverview(db)
    .then((o) => o.tag)
    .catch(() => "");
  const manifest: SnapshotManifest = {
    appVersion: __APP_VERSION__,
    createdAt: new Date().toISOString(),
    summary: { inGameDate: meta.inGameDate ?? "", playerNationTag },
    tables,
  };
  return encodeSnapshot(manifest, streams);
}
