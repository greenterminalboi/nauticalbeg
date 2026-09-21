import { useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { WorldGoodsOverview } from "./WorldGoodsOverview";
import { MarketList } from "./MarketList";
import { MarketGoodsTable } from "./MarketGoodsTable";
import { MarketGoodPriceChart } from "./MarketGoodPriceChart";
import "./MarketsTab.css";

interface MarketsTabProps {
  db: SaveDatabase;
}

/**
 * 007-production-trade-markets: Factbook's Markets page (contracts/
 * ui-components.md's "MarketsTab (state owner)"). Save-wide, not
 * nation-scoped — same shape as WarsTab/LeaderboardTab. Mirrors
 * MapTab/LeaderboardTab's lift-state-to-the-tab pattern: this component
 * owns which market/good are selected, and passes plain callback props
 * down rather than each child managing its own selection.
 *
 * Always renders `WorldGoodsOverview` and `MarketList` with zero
 * interaction required (FR-002). Selecting a market reveals its
 * `MarketGoodsTable` (User Story 2); selecting a different market clears
 * any selected good, since a good selection only makes sense within its
 * own market. Selecting a good then reveals its `MarketGoodPriceChart`
 * (User Story 3) — see that component's hook point below.
 */
export function MarketsTab({ db }: MarketsTabProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [selectedGoodId, setSelectedGoodId] = useState<string | null>(null);

  function handleSelectMarket(marketId: number) {
    setSelectedMarketId(marketId);
    setSelectedGoodId(null);
  }

  return (
    <div className="markets-tab">
      <div className="markets-tab__overview">
        <h2 className="markets-tab__heading">World Goods</h2>
        <WorldGoodsOverview db={db} />
      </div>
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
    </div>
  );
}
