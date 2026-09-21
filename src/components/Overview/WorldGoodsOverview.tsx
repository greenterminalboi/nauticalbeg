import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import type { PerspectiveClickEventDetail } from "@perspective-dev/viewer";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listWorldGoodsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./WorldGoodsOverview.css";

interface WorldGoodsOverviewProps {
  db: SaveDatabase;
  selectedGood: string | null;
  onSelectGood: (good: string, hasProductionCoverage: boolean) => void;
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
 * specs/009-world-goods-production: gains `has_production_coverage`
 * (FR-005's visible coverage marker) and row-selection-to-callback via
 * the same `onClick`/`"perspective-click"` pattern `MarketList`/
 * `MarketGoodsTable` already established. The click payload's own
 * `has_production_coverage` is passed straight through to
 * `onSelectGood`, so `WorldGoodsPage` never needs a second fetch just
 * to answer "is this good covered."
 */
export function WorldGoodsOverview({ db, selectedGood, onSelectGood }: WorldGoodsOverviewProps) {
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

  function handleClick(data: PerspectiveClickEventDetail) {
    const good = data.row.good;
    if (typeof good === "string" && good.length > 0) {
      const coverage = data.row.has_production_coverage;
      const hasProductionCoverage =
        typeof coverage === "boolean" ? coverage : Number(coverage) === 1;
      onSelectGood(good, hasProductionCoverage);
    }
  }

  if (error) {
    return <NotAvailableState subject="world goods production" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="tradeable goods" message="This save has no recorded goods production." />;
  }

  return (
    <div className="world-goods-overview" data-selected-good={selectedGood ?? undefined}>
      {table ? (
        <PerspectiveViewer
          className="world-goods-overview__viewer"
          client={table}
          config={{
            sort: [["total", "desc"]],
            columns: ["good", "total", "has_production_coverage"],
          }}
          onClick={handleClick}
        />
      ) : (
        <p>Loading world goods…</p>
      )}
    </div>
  );
}
