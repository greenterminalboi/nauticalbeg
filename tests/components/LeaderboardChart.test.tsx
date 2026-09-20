import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaderboardChart, type LeaderboardChartSeries } from "../../src/components/Overview/LeaderboardChart";

const series: LeaderboardChartSeries[] = [
  {
    nationIdx: 1,
    label: "RUS",
    color: [183, 136, 27],
    points: Array.from({ length: 10 }, (_, i) => ({ year: 1337 + i * 10, value: i * 5 })),
  },
];

function mockSvgSize(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 300, right: 640, bottom: 300 }) as DOMRect;
}

describe("LeaderboardChart", () => {
  it("renders more than two tick labels on each axis (expanded axis labels)", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    // 6 x-ticks + 6 y-ticks = 12 axis-label texts, not just a min/max pair.
    const labels = document.querySelectorAll(".leaderboard-chart__axis-label");
    expect(labels.length).toBeGreaterThan(4);
  });

  it("renders no zoom-reset button before any zoom interaction", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    expect(screen.queryByRole("button", { name: "Reset zoom" })).not.toBeInTheDocument();
  });

  it("wheel-zooms in around the cursor, narrowing the visible year range, and Reset zoom restores it", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    const svg = document.querySelector(".leaderboard-chart__svg") as SVGSVGElement;
    mockSvgSize(svg);

    const initialPath = svg.querySelector(".leaderboard-chart__line")!.getAttribute("d");

    fireEvent.wheel(svg, { deltaY: -100, clientX: 320, clientY: 150 });

    const zoomedPath = svg.querySelector(".leaderboard-chart__line")!.getAttribute("d");
    expect(zoomedPath).not.toBe(initialPath);
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    const resetPath = svg.querySelector(".leaderboard-chart__line")!.getAttribute("d");
    expect(resetPath).toBe(initialPath);
    expect(screen.queryByRole("button", { name: "Reset zoom" })).not.toBeInTheDocument();
  });

  it("click-drag pans the view once zoomed in", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    const svg = document.querySelector(".leaderboard-chart__svg") as SVGSVGElement;
    mockSvgSize(svg);

    fireEvent.wheel(svg, { deltaY: -300, clientX: 320, clientY: 150 });
    const zoomedPath = svg.querySelector(".leaderboard-chart__line")!.getAttribute("d");

    fireEvent.mouseDown(svg, { clientX: 400, clientY: 150, button: 0 });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 150 });
    fireEvent.mouseUp(svg);

    const pannedPath = svg.querySelector(".leaderboard-chart__line")!.getAttribute("d");
    expect(pannedPath).not.toBe(zoomedPath);
  });

  it("clips plotted lines/points to the axes' inner rectangle so zoomed-out-of-range data doesn't bleed past the axis box", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    const svg = document.querySelector(".leaderboard-chart__svg") as SVGSVGElement;

    const clipPath = svg.querySelector("clipPath");
    expect(clipPath).toBeTruthy();
    const clipId = clipPath!.getAttribute("id");
    expect(clipId).toBeTruthy();

    // A rect matching the axes' inner plotting rectangle backs the clip.
    const clipRect = clipPath!.querySelector("rect");
    expect(clipRect).toBeTruthy();

    // The series' line/points render inside a <g> referencing that clip.
    const line = svg.querySelector(".leaderboard-chart__line")!;
    const clippedGroup = line.closest(`g[clip-path="url(#${clipId})"]`);
    expect(clippedGroup).toBeTruthy();
  });

  it("halves the x-axis tick count for every 100 years of visible range, per direct request", () => {
    const narrowSeries: LeaderboardChartSeries[] = [
      { nationIdx: 1, label: "RUS", color: null, points: [{ year: 1400, value: 1 }, { year: 1450, value: 2 }] },
    ];
    const wideSeries: LeaderboardChartSeries[] = [
      { nationIdx: 1, label: "RUS", color: null, points: [{ year: 1337, value: 1 }, { year: 1628, value: 2 }] },
    ];

    const { container: narrow } = render(<LeaderboardChart title="Population" series={narrowSeries} />);
    const { container: wide } = render(<LeaderboardChart title="Population" series={wideSeries} />);

    // Only the x-axis labels sit at the bottom (y matches the x-tick
    // row); count those specifically rather than every axis-label text
    // (which also includes the fixed-count y-axis labels).
    const countXTicks = (root: HTMLElement) =>
      Array.from(root.querySelectorAll(".leaderboard-chart__axis-label")).filter(
        (el) => el.getAttribute("text-anchor") === "middle",
      ).length;

    // Narrow range (~50 years, 0 halvings) keeps the full 6 x-ticks;
    // wide range (~291 years, 2 halvings: 100-199 and 200-299) drops to
    // max(2, round(6/4)) = 2.
    expect(countXTicks(narrow)).toBe(6);
    expect(countXTicks(wide)).toBe(2);
  });

  it("detects hover via one shared mousemove hit-test (not a per-point listener) and clears it on mouseleave", () => {
    render(<LeaderboardChart title="Population" series={series} />);
    const svg = document.querySelector(".leaderboard-chart__svg") as SVGSVGElement;
    mockSvgSize(svg);

    // No circle carries its own mouse handlers or a <title> anymore —
    // hover is SVG-wide only.
    const firstCircle = svg.querySelector(".leaderboard-chart__point")!;
    expect(firstCircle.querySelector("title")).toBeNull();

    // The first point (year 1337, value 0 — the series' minimum) sits
    // at the plot's bottom-left corner (x=PADDING.left, y=HEIGHT-
    // PADDING.bottom — SVG y grows downward, so the minimum value is at
    // the bottom) — move the mouse there and expect the tooltip to appear.
    fireEvent.mouseMove(svg, { clientX: 72, clientY: 264 });
    expect(document.querySelector(".leaderboard-chart__tooltip")).toBeTruthy();
    expect(document.querySelector(".leaderboard-chart__tooltip")!.textContent).toContain("RUS");

    // Moving far away from every point clears it.
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 50 });
    expect(document.querySelector(".leaderboard-chart__tooltip")).toBeNull();

    // mouseleave also clears any lingering hover state.
    fireEvent.mouseMove(svg, { clientX: 72, clientY: 264 });
    expect(document.querySelector(".leaderboard-chart__tooltip")).toBeTruthy();
    fireEvent.mouseLeave(svg);
    expect(document.querySelector(".leaderboard-chart__tooltip")).toBeNull();
  });
});
