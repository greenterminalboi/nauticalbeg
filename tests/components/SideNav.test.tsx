import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SideNav } from "../../src/components/Overview/SideNav";

describe("SideNav", () => {
  it("lists every data category (FR-001; AI Agent/Map moved to the top-level app nav — decision 2026-09-18)", () => {
    render(<SideNav activeTab="overview" onSelectTab={vi.fn()} />);
    for (const label of [
      "Overview",
      "Provinces",
      "Military",
      "Government",
      "Economy",
      "Diplomacy",
      "Trade",
      "Building Registry",
      "Characters",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /AI Agent/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Map$/ })).not.toBeInTheDocument();
  });

  it("calling onSelectTab is wired to every item (Acceptance Scenario 6)", () => {
    const onSelectTab = vi.fn();
    render(<SideNav activeTab="overview" onSelectTab={onSelectTab} />);
    screen.getByRole("button", { name: /^Provinces/ }).click();
    expect(onSelectTab).toHaveBeenCalledWith("provinces");
  });

  it("marks the active tab distinctly (aria-current)", () => {
    render(<SideNav activeTab="military" onSelectTab={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Military/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Overview/ })).not.toHaveAttribute("aria-current");
  });

  it("every item is a native, keyboard-operable button (FR-015)", () => {
    render(<SideNav activeTab="overview" onSelectTab={vi.fn()} />);
    screen.getAllByRole("button").forEach((button) => {
      expect(button.tagName).toBe("BUTTON");
    });
  });
});
