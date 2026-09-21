import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { decodeMarketGoodPriceHistory, type MarketGoodPricePoint } from "./marketData";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./MarketGoodPriceChart.css";

interface MarketGoodPriceChartProps {
  db: SaveDatabase;
  marketId: number;
  good: string;
}

/**
 * specs/007-production-trade-markets User Story 3: one good's recorded
 * price history within one market, as an ECharts line chart via the
 * shared `useEChartsInstance` hook. Only the real points
 * `listMarketGoodPriceHistoryArrow` returns are ever plotted (FR-007/
 * SC-003) — no interpolation/extrapolation to fill out a longer range
 * for a good with a short recorded history. ECharts' own default
 * axis tooltip (`trigger: "axis"`) already satisfies FR-008's
 * point-inspection requirement without a custom formatter.
 */
export function MarketGoodPriceChart({ db, marketId, good }: MarketGoodPriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<MarketGoodPricePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setError(null);
    decodeMarketGoodPriceHistory(db, marketId, good)
      .then((result) => {
        if (!cancelled) setPoints(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load this good's price history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, marketId, good]);

  const option = useMemo<EChartsOption | null>(() => {
    if (!points || points.length === 0) return null;
    return {
      xAxis: { type: "time" },
      yAxis: { type: "value", scale: true },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "line",
          name: good,
          // ECharts' time axis wants a parseable date, not "YYYY-MM" —
          // anchored to the 1st of the computed month.
          data: points.map((p): [string, number] => [`${p.date}-01`, p.price]),
        },
      ],
    };
  }, [points, good]);

  useEChartsInstance(containerRef, option);

  if (error) {
    return <NotAvailableState subject="this good's price history" message={error} />;
  }
  if (points && points.length === 0) {
    return (
      <EmptyState
        subject="recorded price history"
        message="No price history recorded for this good in this market."
      />
    );
  }

  return (
    <div className="market-good-price-chart">
      <h3 className="market-good-price-chart__title">{good} price history</h3>
      <div ref={containerRef} className="market-good-price-chart__canvas" />
    </div>
  );
}
