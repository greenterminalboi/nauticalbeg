import { useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import type { MarketsView } from "./MarketsSideNav";
import { WorldGoodsPage } from "./WorldGoodsPage";
import { MarketList } from "./MarketList";
import { MarketGoodsTable } from "./MarketGoodsTable";
import "./MarketsTab.css";

interface MarketsTabProps {
  db: SaveDatabase;
  /** Which view is active — owned by `FileLoader.tsx` and rendered via
   * `MarketsSideNav` in the shell's `sidenav` grid area, the same way
   * Leaderboard's `activeMetric`/`LeaderboardSideNav` split works
   * (state lives in the shell, not in this content component). */
  activeView: MarketsView;
}

/**
 * 007-production-trade-markets: Factbook's Markets page (contracts/
 * ui-components.md's "MarketsTab (state owner)"). Save-wide, not
 * nation-scoped — same shape as WarsTab/LeaderboardTab.
 *
 * specs/009-world-goods-production (post-ship follow-up, 2026-09-21):
 * World Goods and Markets are two switchable pages, but the switch
 * itself lives in the shell's side nav (`MarketsSideNav`), not a
 * top-of-content button group — this component just renders whichever
 * `activeView` it's handed. Selecting a market reveals its
 * `MarketGoodsTable` (User Story 2).
 *
 * Post-ship, 2026-09-21: no longer owns a `selectedGoodId` — User
 * Story 3 (a per-good price chart, the thing selecting a good used to
 * reveal) was removed entirely; see ARCHITECTURE.md's decision log.
 */
export function MarketsTab({ db, activeView }: MarketsTabProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);

  return (
    <div className="markets-tab">
      {activeView === "worldGoods" && (
        <div className="markets-tab__overview">
          <WorldGoodsPage db={db} />
        </div>
      )}
      {activeView === "markets" && (
        <>
          <div className="markets-tab__markets">
            <h2 className="markets-tab__heading">Markets</h2>
            <MarketList db={db} selectedMarketId={selectedMarketId} onSelectMarket={setSelectedMarketId} />
          </div>
          {selectedMarketId !== null && (
            <div className="markets-tab__detail" data-testid="markets-tab-detail">
              <h2 className="markets-tab__heading">Market Goods</h2>
              <MarketGoodsTable db={db} marketId={selectedMarketId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
