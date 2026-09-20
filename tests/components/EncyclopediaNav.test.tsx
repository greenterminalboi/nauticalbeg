import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EncyclopediaNav } from "../../src/components/Overview/EncyclopediaNav";

describe("EncyclopediaNav", () => {
  it("lists Countries, Wars, Leaderboard, Characters, and Markets as peer tabs", () => {
    render(<EncyclopediaNav activeTab="countries" onSelectTab={vi.fn()} />);
    expect(screen.getByRole("button", { name: /countries/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wars/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leaderboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /characters/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /markets/i })).toBeInTheDocument();
  });

  it("marks the active tab distinctly (aria-current)", () => {
    render(<EncyclopediaNav activeTab="wars" onSelectTab={vi.fn()} />);
    expect(screen.getByRole("button", { name: /wars/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /countries/i })).not.toHaveAttribute("aria-current");
  });

  it("invokes onSelectTab when a tab is clicked", () => {
    const onSelectTab = vi.fn();
    render(<EncyclopediaNav activeTab="countries" onSelectTab={onSelectTab} />);
    fireEvent.click(screen.getByRole("button", { name: /wars/i }));
    expect(onSelectTab).toHaveBeenCalledWith("wars");
  });
});
