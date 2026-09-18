import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NationSelector } from "../../src/components/Overview/NationSelector";
import type { NationSummary } from "../../src/storage/queries";

const nations: NationSummary[] = [
  { idx: 2025, tag: "RUS", name: "Russia" },
  { idx: 3, tag: "SCA", name: "SCA" },
];

describe("NationSelector", () => {
  it("lists every nation and shows the selected one (FR-015)", () => {
    render(<NationSelector nations={nations} selectedIdx={2025} onSelect={() => {}} />);

    const select = screen.getByRole("combobox", { name: /viewing nation/i });
    expect(select).toHaveValue("2025");
    expect(screen.getByRole("option", { name: "Russia (RUS)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SCA (SCA)" })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen nation's idx", () => {
    const onSelect = vi.fn();
    render(<NationSelector nations={nations} selectedIdx={2025} onSelect={onSelect} />);

    fireEvent.change(screen.getByRole("combobox", { name: /viewing nation/i }), {
      target: { value: "3" },
    });

    expect(onSelect).toHaveBeenCalledWith(3);
  });
});
