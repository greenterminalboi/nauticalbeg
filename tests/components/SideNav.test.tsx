import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SideNav } from "../../src/components/Overview/SideNav";

describe("SideNav", () => {
  it("lists the Countries tabs in order, without Trade or Diplomacy (specs/018 FR-001/FR-002)", () => {
    render(<SideNav activeTab="overview" onSelectTab={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Overview",
      "History",
      "Provinces",
      "Locations",
      "Military",
      "Government",
      "Estates",
      "Values",
      "Subjects",
      "Economy",
      "Building Registry",
      "Characters",
    ]);
    expect(screen.queryByRole("button", { name: /Trade/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Diplomacy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI Agent/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Map$/ })).not.toBeInTheDocument();
  });

  it("calling onSelectTab is wired to every item (Acceptance Scenario 6)", () => {
    const onSelectTab = vi.fn();
    render(<SideNav activeTab="overview" onSelectTab={onSelectTab} />);
    screen.getByRole("button", { name: /^Provinces/ }).click();
    expect(onSelectTab).toHaveBeenCalledWith("provinces");
    screen.getByRole("button", { name: /^Subjects/ }).click();
    expect(onSelectTab).toHaveBeenCalledWith("subjects");
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
