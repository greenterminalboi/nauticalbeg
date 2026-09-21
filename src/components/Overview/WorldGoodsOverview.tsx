import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listWorldGoodsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./WorldGoodsOverview.css";

interface WorldGoodsOverviewProps {
  db: SaveDatabase;
}

/**
 * 007-production-trade-markets User Story 1: a save-wide overview of
 * every tradeable good and its total world production (FR-002a), via a
 * Perspective datagrid — same wiring pattern as WarsTab.tsx (worker
 * table creation, cleanup with `.delete({lazy:true})` + a `cancelled`
 * guard, empty/error states). A good with zero total production still
 * appears (spec's Edge Cases) — `listWorldGoodsArrow` already returns
 * every row from `world_good_production` unfiltered, so this component
 * does no additional filtering of its own.
 *
 * No selection — informational only (contracts/ui-components.md).
 */
export function WorldGoodsOverview({ db }: WorldGoodsOverviewProps) {
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
      const [worker, arrowBuffer] = await Promise.all([getPerspectiveWorker(), listWorldGoodsArrow(db)]);
      if (cancelled) return;
      createdTable = await worker.table(arrowBuffer, { name: "world-goods" });
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
        setError(err instanceof Error ? err.message : "Failed to load world goods.");
      }
    });

    return () => {
      cancelled = true;
      createdTable?.delete({ lazy: true });
    };
  }, [db]);

  if (error) {
    return <NotAvailableState subject="world goods production" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="tradeable goods" message="This save has no recorded goods production." />;
  }

  return (
    <div className="world-goods-overview">
      {table ? (
        <PerspectiveViewer
          className="world-goods-overview__viewer"
          client={table}
          config={{
            sort: [["total", "desc"]],
            columns: ["good", "total"],
          }}
        />
      ) : (
        <p>Loading world goods…</p>
      )}
    </div>
  );
}
