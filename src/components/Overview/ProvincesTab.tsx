import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listProvincesArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./ProvincesTab.css";

interface ProvincesTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

/**
 * FR-004: lists the selected nation's provinces (name + development) via
 * a Perspective datagrid (decision 2026-09-18 — Perspective is this
 * app's standard table tooling, not a plain HTML table). Perspective
 * virtualizes and paginates rows itself, so — unlike the version this
 * replaced — every one of the nation's provinces is loaded into one
 * Perspective `Table` up front rather than being fetched page by page.
 *
 * Re-fetches whenever `nationIdx` changes, satisfying FR-003 without
 * FileLoader needing to own this tab's data. The `cancelled` guard (same
 * pattern as FileLoader's own effects) means a rapid nation switch
 * mid-fetch never renders a stale result (Edge Case/scenario 17). The
 * previous Perspective `Table` is deleted before building the new one —
 * per `@perspective-dev/react`'s docs, a `Table` passed as `client`
 * survives unmount and is the caller's to free.
 */
export function ProvincesTab({ db, nationIdx }: ProvincesTabProps) {
  const [table, setTable] = useState<Table | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdTable: Table | null = null;
    setTable(null);
    setIsEmpty(false);
    setError(null);

    (async () => {
      const [worker, arrowBuffer] = await Promise.all([
        getPerspectiveWorker(),
        listProvincesArrow(db, nationIdx),
      ]);
      if (cancelled) return;
      createdTable = await worker.table(arrowBuffer, { name: `provinces-${nationIdx}` });
      const size = await createdTable.size();
      if (cancelled) {
        createdTable.delete({ lazy: true });
        return;
      }
      if (size === 0) {
        createdTable.delete({ lazy: true });
        setIsEmpty(true);
        return;
      }
      setTable(createdTable);
    })().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load provinces.");
      }
    });

    return () => {
      cancelled = true;
      createdTable?.delete({ lazy: true });
    };
  }, [db, nationIdx]);

  if (error) {
    return <NotAvailableState subject="province data" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="provinces" />;
  }

  return (
    <div className="provinces-tab">
      {table ? (
        <PerspectiveViewer
          className="provinces-tab__viewer"
          client={table}
          config={{ sort: [["name", "asc"]] }}
        />
      ) : (
        <p>Loading provinces…</p>
      )}
    </div>
  );
}
