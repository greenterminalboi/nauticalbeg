// specs/019-battle-simulator US4: Firepower's "Simulate a battle" bar.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SimulateMatchupBar } from "../../src/components/Overview/SimulateMatchupBar";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";

const country = (idx: number, name: string): LeaderboardCountry => ({ idx, tag: name.slice(0, 3).toUpperCase(), name, color: null, isHumanPlayed: false });
const countries = [country(2025, "Russia"), country(3, "Sweden"), country(7, "Poland")];

describe("SimulateMatchupBar", () => {
  it("defaults to the first two selected countries and sends them as attacker/defender", () => {
    const onSimulate = vi.fn();
    render(<SimulateMatchupBar countries={countries} onSimulate={onSimulate} />);
    expect(screen.getByRole("combobox", { name: "Attacker" })).toHaveValue("2025");
    expect(screen.getByRole("combobox", { name: "Defender" })).toHaveValue("3");
    fireEvent.click(screen.getByRole("button", { name: /open in battle simulator/i }));
    expect(onSimulate).toHaveBeenCalledWith({ attackerIdx: 2025, defenderIdx: 3 });
  });

  it("swaps sides and lets any selected country be picked", () => {
    const onSimulate = vi.fn();
    render(<SimulateMatchupBar countries={countries} onSimulate={onSimulate} />);
    fireEvent.click(screen.getByRole("button", { name: /swap attacker and defender/i }));
    fireEvent.change(screen.getByRole("combobox", { name: "Defender" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /open in battle simulator/i }));
    expect(onSimulate).toHaveBeenCalledWith({ attackerIdx: 3, defenderIdx: 7 });
  });

  it("refuses the same country on both sides", () => {
    render(<SimulateMatchupBar countries={countries} onSimulate={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Defender" }), { target: { value: "2025" } });
    expect(screen.getByRole("button", { name: /open in battle simulator/i })).toBeDisabled();
    expect(screen.getByText(/two different countries/i)).toBeInTheDocument();
  });
});
