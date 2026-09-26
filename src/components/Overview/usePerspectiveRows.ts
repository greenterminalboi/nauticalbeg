import { useEffect, useState } from "react";
import type { Table } from "@perspective-dev/client";
import { getPerspectiveWorker } from "../../perspective/setup";
import type { SaveDatabase } from "../../storage/db";

export type PerspectiveSchema = Record<string, "string" | "float" | "integer" | "boolean" | "date">;

export type PerspectiveRowsState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; table: Table };

/**
 * specs/018: loads rows for one nation into a Perspective table built from
 * an explicit schema (so a column that's empty for a small nation still
 * gets the right type). Refetches when the save or `key` changes; a
 * result for an older one is dropped and its table freed. The Provinces and Locations
 * tabs share this.
 */
export function usePerspectiveRows(
  db: SaveDatabase,
  key: string,
  schema: PerspectiveSchema,
  load: () => Promise<Record<string, unknown>[]>,
): PerspectiveRowsState {
  const [state, setState] = useState<PerspectiveRowsState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let created: Table | null = null;
    setState({ kind: "loading" });

    (async () => {
      const rows = await load();
      if (cancelled) return;
      if (rows.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      const worker = await getPerspectiveWorker();
      created = await worker.table(schema, { name: key });
      await created.update(rows);
      if (cancelled) {
        created.delete({ lazy: true });
        return;
      }
      setState({ kind: "ready", table: created });
    })().catch((err: unknown) => {
      if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load." });
    });

    return () => {
      cancelled = true;
      created?.delete({ lazy: true });
    };
    // `schema` and `load` are fixed per caller; `db` + `key` name the data.
  }, [db, key]);

  return state;
}
