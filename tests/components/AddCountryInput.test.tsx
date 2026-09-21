import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddCountryInput } from "../../src/components/Overview/AddCountryInput";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";

function country(idx: number, tag: string, color: [number, number, number] | null = null): LeaderboardCountry {
  return { idx, tag, name: null, color, isHumanPlayed: false };
}

const COUNTRIES: LeaderboardCountry[] = [
  country(1, "RUS", [183, 136, 27]),
  country(2, "SCA", [10, 20, 30]),
  country(3, "FRA", null),
];

describe("AddCountryInput", () => {
  it("shows the placeholder and no results list until focused", () => {
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[]} onToggle={vi.fn()} />);
    expect(screen.getByPlaceholderText("Add country…")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("opens the full country list on focus, with no search text required", () => {
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[]} onToggle={vi.fn()} />);
    fireEvent.focus(screen.getByPlaceholderText("Add country…"));

    expect(screen.getByRole("checkbox", { name: "RUS" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "SCA" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "FRA" })).toBeInTheDocument();
  });

  it("filters the list by a case-insensitive substring search", () => {
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[]} onToggle={vi.fn()} />);
    const input = screen.getByPlaceholderText("Add country…");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "sc" } });

    expect(screen.getByRole("checkbox", { name: "SCA" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "RUS" })).not.toBeInTheDocument();
  });

  it("checking a result calls onToggle with that country's idx", () => {
    const onToggle = vi.fn();
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[]} onToggle={onToggle} />);
    fireEvent.focus(screen.getByPlaceholderText("Add country…"));
    fireEvent.click(screen.getByRole("checkbox", { name: "SCA" }));

    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it("shows a selected country's checkbox as checked", () => {
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[2]} onToggle={vi.fn()} />);
    fireEvent.focus(screen.getByPlaceholderText("Add country…"));

    expect(screen.getByRole("checkbox", { name: "SCA" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "RUS" })).not.toBeChecked();
  });

  it("closes the list when focus leaves the whole control", () => {
    render(<AddCountryInput countries={COUNTRIES} selectedIdxs={[]} onToggle={vi.fn()} />);
    const input = screen.getByPlaceholderText("Add country…");
    fireEvent.focus(input);
    expect(screen.getByRole("checkbox", { name: "RUS" })).toBeInTheDocument();

    fireEvent.blur(input, { relatedTarget: document.body });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
