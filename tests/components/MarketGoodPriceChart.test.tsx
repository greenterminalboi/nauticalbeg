import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { MarketGoodPriceChart } from "../../src/components/Overview/MarketGoodPriceChart";
import * as marketData from "../../src/components/Overview/marketData";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";
import type { SaveDatabase } from "../../src/storage/db";

// Same approach as MarketList.test.tsx's PerspectiveViewer mock: replace
// the shared ECharts lifecycle hook with a spy so this test asserts on
// the exact `option` object built, rather than on real SVG chart output.
vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({
  useEChartsInstance: vi.fn(),
}));

const fakeDb = {} as SaveDatabase;

beforeEach(() => {
  vi.mocked(chartHook.useEChartsInstance).mockReset();
});

function latestOption(): EChartsOption | null {
  const calls = vi.mocked(chartHook.useEChartsInstance).mock.calls;
  return calls[calls.length - 1]?.[1] ?? null;
}

describe("MarketGoodPriceChart", () => {
  it("builds a line series from exactly the recorded price points, in order (FR-007, SC-003)", async () => {
    vi.spyOn(marketData, "decodeMarketGoodPriceHistory").mockResolvedValue([
      { date: "1628-06", price: 1.2 },
      { date: "1628-07", price: 1.22 },
      { date: "1628-08", price: 1.25 },
    ]);

    render(<MarketGoodPriceChart db={fakeDb} marketId={1} good="clay" />);

    await waitFor(() => expect(latestOption()).not.toBeNull());
    expect(marketData.decodeMarketGoodPriceHistory).toHaveBeenCalledWith(fakeDb, 1, "clay");

    const option = latestOption()!;
    const series = option.series as Array<{ data?: unknown[] }>;
    expect(series).toHaveLength(1);
    // Exactly 3 points in, 3 points out — no interpolation/extrapolation
    // to fill out a longer range (spec's short-history edge case).
    expect(series[0].data).toHaveLength(3);
    expect(series[0].data).toEqual([
      ["1628-06-01", 1.2],
      ["1628-07-01", 1.22],
      ["1628-08-01", 1.25],
    ]);
  });

  it("re-queries when the selected market/good changes", async () => {
    vi.spyOn(marketData, "decodeMarketGoodPriceHistory").mockResolvedValue([{ date: "1628-08", price: 1.25 }]);

    const { rerender } = render(<MarketGoodPriceChart db={fakeDb} marketId={1} good="clay" />);
    await waitFor(() =>
      expect(marketData.decodeMarketGoodPriceHistory).toHaveBeenCalledWith(fakeDb, 1, "clay"),
    );

    rerender(<MarketGoodPriceChart db={fakeDb} marketId={1} good="wool" />);
    await waitFor(() =>
      expect(marketData.decodeMarketGoodPriceHistory).toHaveBeenCalledWith(fakeDb, 1, "wool"),
    );
  });

  it("renders EmptyState, not a fabricated flat line, when the good has no recorded history for this market", async () => {
    vi.spyOn(marketData, "decodeMarketGoodPriceHistory").mockResolvedValue([]);

    const { findByText } = render(<MarketGoodPriceChart db={fakeDb} marketId={2} good="amber" />);

    await findByText("Nothing to show");
    // The chart hook is never handed an option with a fabricated series.
    expect(latestOption()).toBeNull();
  });

  it("renders NotAvailableState when the query fails", async () => {
    vi.spyOn(marketData, "decodeMarketGoodPriceHistory").mockRejectedValue(new Error("boom"));

    const { findByText } = render(<MarketGoodPriceChart db={fakeDb} marketId={1} good="clay" />);

    await findByText("boom");
    await findByText("Not available for this save");
  });
});
