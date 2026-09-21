import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import type { PerspectiveClickEventDetail } from "@perspective-dev/viewer";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listMarketsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./MarketList.css";

interface MarketListProps {
  db: SaveDatabase;
  selectedMarketId: number | null;
  onSelectMarket: (marketId: number) => void;
}

/**
 * 007-production-trade-markets User Story 1: every market in the save,
 * via a Perspective datagrid — same wiring pattern as WarsTab.tsx/
 * WorldGoodsOverview.tsx. A market with no resolvable name already gets
 * a neutral fallback from `listMarketsArrow`/`decodeMarkets` (FR-003) —
 * this component just displays whatever `name` comes back, no filtering.
 *
 * Row-selection-to-callback (research.md flagged this as new plumbing —
 * no existing PerspectiveViewer usage in this codebase wires a row click
 * to app state). Resolved via `@perspective-dev/react`'s own `onClick`
 * prop, which subscribes to the underlying `<perspective-viewer>`
 * element's first-class `"perspective-click"` Custom Event (confirmed in
 * `@perspective-dev/viewer`'s `extensions.d.ts` and traced into
 * `@perspective-dev/viewer-datagrid`'s dispatch site: the event's `row`
 * is the clicked row's full `View.to_json()` result, keyed by every
 * column named in this viewer's `config.columns` — NOT just the ones
 * rendered by a particular plugin). Because the callback needs the
 * market's numeric `idx` (not just its display `name`, which is not
 * guaranteed unique — see the neutral-fallback edge case above), `idx`
 * is included as a real, visible grid column here alongside `name`,
 * `member_count`, `capacity` — a small, deliberate deviation from
 * contracts/ui-components.md's exact 3-column list, made because
 * Perspective has no "queried but hidden" column concept (`columns`
 * controls the view's output, full stop). `idx` is also just useful
 * information for a market list on its own.
 */
export function MarketList({ db, selectedMarketId, onSelectMarket }: MarketListProps) {
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
      const [worker, arrowBuffer] = await Promise.all([getPerspectiveWorker(), listMarketsArrow(db)]);
      if (cancelled) return;
      createdTable = await worker.table(arrowBuffer, { name: "markets" });
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
        setError(err instanceof Error ? err.message : "Failed to load markets.");
      }
    });

    return () => {
      cancelled = true;
      createdTable?.delete({ lazy: true });
    };
  }, [db]);

  function handleClick(data: PerspectiveClickEventDetail) {
    const raw = data.row.idx;
    const idx = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(idx)) {
      onSelectMarket(idx);
    }
  }

  if (error) {
    return <NotAvailableState subject="market data" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="markets" message="This save has no recorded markets." />;
  }

  return (
    <div className="market-list" data-selected-market-id={selectedMarketId ?? undefined}>
      {table ? (
        <PerspectiveViewer
          className="market-list__viewer"
          client={table}
          config={{
            sort: [["name", "asc"]],
            columns: ["idx", "name", "member_count", "capacity"],
          }}
          onClick={handleClick}
        />
      ) : (
        <p>Loading markets…</p>
      )}
    </div>
  );
}
