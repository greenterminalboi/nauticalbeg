// specs/019-battle-simulator US4: a matchup sent from Firepower pre-fills
// both sides from the save, once per request.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { applySchema, closeSaveDatabase, openSaveDatabase, type SaveDatabase } from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { BattleSimulatorSection } from "../../src/components/BattleSimulator/BattleSimulatorSection";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({ useEChartsInstance: vi.fn() }));

const fixtureText = readFileSync(path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5"), "utf-8");

describe("BattleSimulatorSection matchup import (US4)", () => {
  let db: SaveDatabase;
  beforeAll(() => ensureTestDuckDBConfigured());
  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("pre-fills attacker and defender from the requested nations' largest armies", async () => {
    db = await openSaveDatabase("battlesim-matchup.db");
    await applySchema(db);
    await parseAndStore(db, "battlesim-matchup", "rus-1628-minimal.eu5", toBytes(fixtureText));

    render(<BattleSimulatorSection db={db} matchup={{ id: 1, attackerIdx: 2025, defenderIdx: 3 }} />);

    expect(await screen.findByText(/imported from firepower/i, {}, { timeout: 10000 })).toBeInTheDocument();
    const attacker = screen.getByRole("region", { name: "Attacker" });
    const defender = screen.getByRole("region", { name: "Defender" });
    await waitFor(() => expect(within(attacker).getAllByRole("row").length).toBeGreaterThan(1), { timeout: 10000 });
    await waitFor(() => expect(within(defender).getAllByRole("row").length).toBeGreaterThan(1), { timeout: 10000 });
    // SCA's army is led by a general with a trait — carried over as save data.
    expect(within(defender).getByRole("combobox", { name: "Trait" })).toHaveValue("inspirational_leader_general");
    // Both armies have fighting regiments, so the battle can be run straight away.
    expect(screen.getByRole("button", { name: /^simulate$/i })).toBeEnabled();
  }, 30000);
});
