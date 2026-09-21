import { useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import type { MarketsView } from "./MarketsSideNav";
import { WorldGoodsPage } from "./WorldGoodsPage";
import { MarketList } from "./MarketList";
import { MarketGoodsTable } from "./MarketGoodsTable";
import { MarketGoodPriceChart } from "./MarketGoodPriceChart";
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
 * nation-scoped — same shape as WarsTab/LeaderboardTab. Mirrors
 * MapTab/LeaderboardTab's lift-state-to-the-tab pattern: this component
 * owns which market/good are selected, and passes plain callback props
 * down rather than each child managing its own selection.
 *
 * specs/009-world-goods-production (post-ship follow-up, 2026-09-21):
 * World Goods and Markets are two switchable pages, but the switch
 * itself lives in the shell's side nav (`MarketsSideNav`), not a
 * top-of-content button group — this component just renders whichever
 * `activeView` it's handed. Selecting a market reveals its
 * `MarketGoodsTable` (User Story 2, Markets view only); selecting a
 * different market clears any selected good, since a good selection
 * only makes sense within its own market. Selecting a good then
 * reveals its `MarketGoodPriceChart` (User Story 3).
 */
export function MarketsTab({ db, activeView }: MarketsTabProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [selectedGoodId, setSelectedGoodId] = useState<string | null>(null);

  function handleSelectMarket(marketId: number) {
    setSelectedMarketId(marketId);
    setSelectedGoodId(null);
  }

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
            <MarketList db={db} selectedMarketId={selectedMarketId} onSelectMarket={handleSelectMarket} />
          </div>
          {selectedMarketId !== null && (
            <div className="markets-tab__detail" data-testid="markets-tab-detail">
              <h2 className="markets-tab__heading">Market Goods</h2>
              <MarketGoodsTable
                db={db}
                marketId={selectedMarketId}
                selectedGoodId={selectedGoodId}
                onSelectGood={setSelectedGoodId}
              />
              {selectedGoodId !== null && (
                <MarketGoodPriceChart db={db} marketId={selectedMarketId} good={selectedGoodId} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
