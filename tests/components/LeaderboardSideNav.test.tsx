import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaderboardSideNav } from "../../src/components/Overview/LeaderboardSideNav";

describe("LeaderboardSideNav", () => {
  it("renders one item per page and marks the active one", () => {
    render(<LeaderboardSideNav activePage="economical_base" onSelectPage={() => {}} />);
    expect(screen.getByRole("button", { name: "Population" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Economic Base" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Tax Base" })).not.toHaveAttribute("aria-current");
    // Post-ship, 2026-09-21: Ruler History joins the metric pages.
    expect(screen.getByRole("button", { name: "Ruler History" })).not.toHaveAttribute("aria-current");
  });

  it("calls onSelectPage with the clicked item's page", () => {
    const onSelectPage = vi.fn();
    render(<LeaderboardSideNav activePage="population" onSelectPage={onSelectPage} />);
    fireEvent.click(screen.getByRole("button", { name: "Tax Base" }));
    expect(onSelectPage).toHaveBeenCalledWith("tax_base");
  });

  it("calls onSelectPage with 'ruler_history' when that item is clicked", () => {
    const onSelectPage = vi.fn();
    render(<LeaderboardSideNav activePage="population" onSelectPage={onSelectPage} />);
    fireEvent.click(screen.getByRole("button", { name: "Ruler History" }));
    expect(onSelectPage).toHaveBeenCalledWith("ruler_history");
  });
});
