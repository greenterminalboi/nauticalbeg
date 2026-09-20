import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaderboardSideNav } from "../../src/components/Overview/LeaderboardSideNav";

describe("LeaderboardSideNav", () => {
  it("renders one item per metric and marks the active one", () => {
    render(<LeaderboardSideNav activeMetric="economical_base" onSelectMetric={() => {}} />);
    expect(screen.getByRole("button", { name: "Population" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Economic Base" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Tax Base" })).not.toHaveAttribute("aria-current");
  });

  it("calls onSelectMetric with the clicked item's metric", () => {
    const onSelectMetric = vi.fn();
    render(<LeaderboardSideNav activeMetric="population" onSelectMetric={onSelectMetric} />);
    fireEvent.click(screen.getByRole("button", { name: "Tax Base" }));
    expect(onSelectMetric).toHaveBeenCalledWith("tax_base");
  });
});
