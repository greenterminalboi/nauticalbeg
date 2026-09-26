// specs/019-battle-simulator FR-017: running scoreboard across runs.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { simulateBattle } from "../../src/battleSim/engine";
import { addToScoreboard } from "../../src/components/BattleSimulator/BattleScoreboard";
import { BattleSimulatorSection } from "../../src/components/BattleSimulator/BattleSimulatorSection";
import { sampleInput } from "../battleSim/helpers";

vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({ useEChartsInstance: vi.fn() }));

describe("addToScoreboard", () => {
  it("counts each new seed of the same inputs", () => {
    let board = addToScoreboard(null, simulateBattle(sampleInput(1))).board;
    board = addToScoreboard(board, simulateBattle(sampleInput(2))).board;
    expect(board.runs.map((r) => r.seed)).toEqual([1, 2]);
  });

  it("doesn't count a replayed seed twice", () => {
    const first = addToScoreboard(null, simulateBattle(sampleInput(1))).board;
    const again = addToScoreboard(first, simulateBattle(sampleInput(1)));
    expect(again.board.runs).toHaveLength(1);
    expect(again.note).toMatch(/already counted/);
  });

  it("restarts when the inputs change, and says so", () => {
    const first = addToScoreboard(null, simulateBattle(sampleInput(1, 12, 12))).board;
    const changed = addToScoreboard(first, simulateBattle(sampleInput(2, 14, 12)));
    expect(changed.board.runs).toHaveLength(1);
    expect(changed.note).toMatch(/inputs changed/i);
  });
});

describe("scoreboard in the Battle Simulator", () => {
  it("accumulates victories and casualties over re-rolls and can be reset", () => {
    render(<BattleSimulatorSection db={null} />);
    for (const side of ["Attacker", "Defender"]) {
      fireEvent.click(within(screen.getByRole("region", { name: side })).getByRole("button", { name: /add regiments/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /^simulate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^re-roll$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^re-roll$/i }));

    const board = screen.getByRole("region", { name: "Scoreboard" });
    expect(within(board).getByRole("img", { name: /victories over 3 runs/i })).toBeInTheDocument();
    const rows = within(board).getAllByRole("row");
    const wins = rows.slice(1).map((r) => Number(within(r).getAllByRole("cell")[0].textContent));
    expect(wins.reduce((a, b) => a + b, 0)).toBe(3);

    fireEvent.click(within(board).getByRole("button", { name: /reset scores/i }));
    expect(screen.queryByRole("region", { name: "Scoreboard" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^re-roll$/i }));
    expect(within(screen.getByRole("region", { name: "Scoreboard" })).getByRole("img", { name: /victories over 1 run:/i })).toBeInTheDocument();
  });
});
