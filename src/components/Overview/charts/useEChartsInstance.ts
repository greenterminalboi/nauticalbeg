import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

/**
 * specs/007-production-trade-markets research.md §3: the one shared
 * init/resize/dispose lifecycle for every ECharts-based chart in this
 * app (`MarketGoodPriceChart`, `LeaderboardChart`, `LeaderboardTreemap`)
 * — each owns only its own `option` object. `renderer: "svg"` (not the
 * canvas default): keeps every chart testable under this project's jsdom
 * test environment with no canvas polyfill, and mirrors the crisp,
 * inspectable DOM output the hand-rolled SVG charts it replaces already
 * had.
 *
 * `option` must be a value the caller memoizes (e.g. `useMemo`) — a new
 * object identity on every render re-applies `setOption` every render.
 */
export function useEChartsInstance(
  containerRef: React.RefObject<HTMLDivElement | null>,
  option: EChartsOption | null,
): void {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, { renderer: "svg" });
    chartRef.current = chart;

    // jsdom (this project's test environment) has no ResizeObserver;
    // real browsers all do, so this only ever degrades in tests, where
    // resize behavior isn't under test.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    if (option) chartRef.current?.setOption(option, true);
  }, [option]);
}
