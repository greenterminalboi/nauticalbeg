// specs/019-battle-simulator: the section in no-save mode (FR-014),
// validation blocking (FR-011) and a labelled simulated result (FR-010).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BattleSimulatorSection } from "../../src/components/BattleSimulator/BattleSimulatorSection";

vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({ useEChartsInstance: vi.fn() }));

function addRegiments(side: "Attacker" | "Defender") {
  const panel = screen.getByRole("region", { name: side });
  fireEvent.click(within(panel).getByRole("button", { name: /add regiments/i }));
  return panel;
}

describe("BattleSimulatorSection", () => {
  it("works without a save: manual sides, blocked until both have regiments", () => {
    render(<BattleSimulatorSection db={null} />);
    expect(screen.getAllByText(/no save loaded/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^simulate$/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/attacker has no fighting regiments/i);

    addRegiments("Attacker");
    addRegiments("Defender");
    expect(screen.getByRole("button", { name: /^simulate$/i })).toBeEnabled();
  });

  it("marks an edited value, blocks invalid input inline, and resets it", () => {
    render(<BattleSimulatorSection db={null} />);
    const attacker = addRegiments("Attacker");
    addRegiments("Defender");
    const count = within(attacker).getByRole("spinbutton", { name: "Count" });
    fireEvent.change(count, { target: { value: "-5" } });
    expect(within(attacker).getByText(/whole number, 0 or more/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^simulate$/i })).toBeDisabled();
    expect(within(attacker).getAllByText("edited").length).toBeGreaterThan(0);

    fireEvent.click(within(attacker).getByRole("button", { name: "Reset Count" }));
    expect(screen.getByRole("button", { name: /^simulate$/i })).toBeEnabled();
  });

  it("shows a result labelled as simulated, with seed replay and the approximations used", () => {
    render(<BattleSimulatorSection db={null} />);
    addRegiments("Attacker");
    addRegiments("Defender");
    fireEvent.click(screen.getByRole("button", { name: /^simulate$/i }));
    const result = screen.getByRole("region", { name: /simulated result/i });
    expect(within(result).getByText(/not recorded game data/i)).toBeInTheDocument();
    expect(within(result).getByText(/approximations used in this run/i)).toBeInTheDocument();
    expect(within(result).getByText("U-01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replay seed \d+/i })).toBeEnabled();
  });
});
