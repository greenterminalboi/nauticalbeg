import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CountrySearchOverlay } from "../../src/components/Overview/CountrySearchOverlay";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";

const countries: LeaderboardCountry[] = [
  { idx: 1, tag: "RUS", name: "Russia", color: [183, 136, 27], isHumanPlayed: true },
  { idx: 2, tag: "SCA", name: null, color: null, isHumanPlayed: false },
  { idx: 3, tag: "FRA", name: "France", color: [10, 20, 30], isHumanPlayed: false },
];

describe("CountrySearchOverlay", () => {
  it("filters results by name substring, case-insensitive", () => {
    render(
      <CountrySearchOverlay countries={countries} selectedIdxs={[1]} onToggle={() => {}} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fra" } });
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.queryByText("Russia")).not.toBeInTheDocument();
    expect(screen.queryByText("SCA")).not.toBeInTheDocument();
  });

  it("filters results by tag substring", () => {
    render(
      <CountrySearchOverlay countries={countries} selectedIdxs={[1]} onToggle={() => {}} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SCA" } });
    expect(screen.getByText("SCA")).toBeInTheDocument();
    expect(screen.queryByText("France")).not.toBeInTheDocument();
  });

  it("calls onToggle with the country's idx when a result is clicked", () => {
    const onToggle = vi.fn();
    render(
      <CountrySearchOverlay countries={countries} selectedIdxs={[1]} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByLabelText("France"));
    expect(onToggle).toHaveBeenCalledWith(3);
  });

  it("marks an already-selected country as checked in the results", () => {
    render(
      <CountrySearchOverlay countries={countries} selectedIdxs={[1]} onToggle={() => {}} />,
    );
    expect((screen.getByLabelText("Russia") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("SCA") as HTMLInputElement).checked).toBe(false);
  });
});
