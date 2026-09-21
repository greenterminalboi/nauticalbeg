import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GoodSelect } from "../../src/components/Overview/GoodSelect";

const GOODS = ["wheat", "clay", "lumber", "wool"];

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "wheat" }));
  return within(screen.getByRole("list"));
}

describe("GoodSelect", () => {
  it("shows the selected good on the closed toggle, not a list", () => {
    render(<GoodSelect goods={GOODS} selectedGood="wheat" onSelectGood={vi.fn()} />);
    expect(screen.getByRole("button", { name: "wheat" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opens to the full goods list when no search text has been entered", () => {
    render(<GoodSelect goods={GOODS} selectedGood="wheat" onSelectGood={vi.fn()} />);
    const list = openPanel();

    for (const good of GOODS) {
      expect(list.getByRole("button", { name: good })).toBeInTheDocument();
    }
  });

  it("filters the list by a case-insensitive substring search", () => {
    render(<GoodSelect goods={GOODS} selectedGood="wheat" onSelectGood={vi.fn()} />);
    const list = openPanel();
    fireEvent.change(screen.getByPlaceholderText(/search rgos/i), { target: { value: "LU" } });

    expect(list.getByRole("button", { name: "lumber" })).toBeInTheDocument();
    expect(list.queryByRole("button", { name: "wheat" })).not.toBeInTheDocument();
    expect(list.queryByRole("button", { name: "clay" })).not.toBeInTheDocument();
  });

  it("shows a no-matches message rather than an empty list for a search with no hits", () => {
    render(<GoodSelect goods={GOODS} selectedGood="wheat" onSelectGood={vi.fn()} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/search rgos/i), { target: { value: "zzz" } });

    expect(screen.getByText("No matching goods.")).toBeInTheDocument();
  });

  it("selecting a good calls onSelectGood and closes the panel", () => {
    const onSelectGood = vi.fn();
    render(<GoodSelect goods={GOODS} selectedGood="wheat" onSelectGood={onSelectGood} />);
    const list = openPanel();
    fireEvent.click(list.getByRole("button", { name: "clay" }));

    expect(onSelectGood).toHaveBeenCalledWith("clay");
    expect(screen.queryByPlaceholderText(/search rgos/i)).not.toBeInTheDocument();
  });
});
