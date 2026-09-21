import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listMarketGoodsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./MarketGoodsTable.css";

interface MarketGoodsTableProps {
  db: SaveDatabase;
  marketId: number;
}

const COLUMNS = [
  "good",
  "price",
  "supply",
  "demand",
  "stockpile",
  "is_importing",
  "is_exporting",
  "supply_raw_materials",
  "supply_buildings",
  "supply_trade",
  "demand_population",
  "demand_trade",
  "demand_building_upkeep",
  "demand_unit_upkeep",
  "demand_construction",
];

/**
 * 007-production-trade-markets User Story 2: the selected market's full
 * per-good breakdown — same wiring pattern as MarketList.tsx (Perspective
 * datagrid). Only goods the market actually trades ever appear (FR-006)
 * — a market with zero traded goods (2 of 184 in the reference save)
 * renders `EmptyState`, not a zero-value row per known good;
 * `listMarketGoodsArrow` itself already guarantees this by only ever
 * returning rows that exist in `market_goods`.
 *
 * Post-ship, 2026-09-21: no longer a row-selection grid — per-good
 * price history (User Story 3, the thing selecting a good used to
 * reveal) was removed entirely (see ARCHITECTURE.md's decision log:
 * pulling it for every good in every market was the single largest
 * cost in parsing a real save), so this is back to a plain read-only
 * grid, matching `WorldGoodsOverview`'s original shape.
 */
export function MarketGoodsTable({ db, marketId }: MarketGoodsTableProps) {
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
        listMarketGoodsArrow(db, marketId),
      ]);
      if (cancelled) return;
      createdTable = await worker.table(arrowBuffer, { name: "market_goods" });
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
        setError(err instanceof Error ? err.message : "Failed to load this market's goods.");
      }
    });

    return () => {
      cancelled = true;
      createdTable?.delete({ lazy: true });
    };
  }, [db, marketId]);

  if (error) {
    return <NotAvailableState subject="this market's goods" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="traded goods" message="This market trades no goods." />;
  }

  return (
    <div className="market-goods-table">
      {table ? (
        <PerspectiveViewer
          className="market-goods-table__viewer"
          client={table}
          config={{ sort: [["good", "asc"]], columns: COLUMNS }}
        />
      ) : (
        <p>Loading market goods…</p>
      )}
    </div>
  );
}
