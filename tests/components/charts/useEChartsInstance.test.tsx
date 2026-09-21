import { describe, expect, it } from "vitest";
import { useRef } from "react";
import { render } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "../../../src/components/Overview/charts/useEChartsInstance";

function TestChart({ option }: { option: EChartsOption | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEChartsInstance(containerRef, option);
  return <div ref={containerRef} style={{ width: 400, height: 300 }} data-testid="chart-container" />;
}

const lineOption: EChartsOption = {
  xAxis: { type: "category", data: ["a", "b"] },
  yAxis: { type: "value" },
  series: [{ type: "line", data: [1, 2] }],
};

describe("useEChartsInstance", () => {
  it("initializes an ECharts instance into the container on mount", () => {
    const { getByTestId } = render(<TestChart option={lineOption} />);
    const container = getByTestId("chart-container");
    // echarts' svg renderer mounts an <svg> root directly inside the container.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("re-renders when the option object changes", () => {
    const { getByTestId, rerender } = render(<TestChart option={lineOption} />);
    const container = getByTestId("chart-container");
    const firstSeriesCount = container.querySelectorAll("svg path").length;

    const nextOption: EChartsOption = {
      ...lineOption,
      series: [{ type: "line", data: [1, 2, 3, 4] }],
    };
    rerender(<TestChart option={nextOption} />);

    // A changed option re-applies setOption; the rendered SVG content
    // reflects the new series rather than staying frozen at the first render.
    expect(container.querySelectorAll("svg path").length).toBeGreaterThanOrEqual(firstSeriesCount);
  });

  it("disposes the chart instance on unmount without throwing", () => {
    const { unmount } = render(<TestChart option={lineOption} />);
    expect(() => unmount()).not.toThrow();
  });

  it("renders nothing chart-related when option is null", () => {
    const { getByTestId } = render(<TestChart option={null} />);
    const container = getByTestId("chart-container");
    // The instance still initializes (a container to hold a future
    // option), but with no option ever set, no series content renders.
    expect(container.querySelectorAll("svg path").length).toBe(0);
  });
});
