import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GovernmentTab } from "../../src/components/Overview/GovernmentTab";
import * as queries from "../../src/storage/queries";
import type { SaveDatabase } from "../../src/storage/db";

const fakeDb = {} as SaveDatabase;

function mockGovernment() {
  vi.spyOn(queries, "listNationLaws").mockResolvedValue([
    { lawCategory: "recruitment_law", object: "expanded_levies_policy", date: "1400.1.1" },
    { lawCategory: "maritime_law", object: "navy_audits", date: "1612.3.4" },
  ]);
  vi.spyOn(queries, "listNationPrivileges").mockResolvedValue([
    { object: "formal_guilds", date: "1500.1.1" },
    { object: "primacy_of_nobility", date: "1400.1.1" },
    { object: "some_modded_privilege", date: null },
  ]);
}

function bodyRows(region: HTMLElement): HTMLElement[] {
  return within(region).getAllByRole("row").slice(1);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GovernmentTab (specs/018 FR-021, FR-030)", () => {
  it("opens on Policies: Law, Policy, Modifiers, Enacted, with readable names", async () => {
    mockGovernment();
    render(<GovernmentTab db={fakeDb} nationIdx={2025} />);

    const policies = await screen.findByRole("region", { name: "Policies" });
    expect(within(policies).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Law",
      "Policy",
      "Modifiers",
      "Enacted",
    ]);
    const [maritime, recruitment] = bodyRows(policies);
    expect(within(maritime).getAllByRole("cell")[0]).toHaveTextContent("Maritime Law");
    expect(within(recruitment).getAllByRole("cell")[1]).toHaveTextContent("Expanded Levies");
    expect(within(recruitment).getAllByRole("cell")[3]).toHaveTextContent("1400.1.1");
    expect(screen.queryByRole("region", { name: "Estate Privileges" })).not.toBeInTheDocument();
  });

  it("lists each policy's modifiers in the Modifiers column, colored the game's way", async () => {
    mockGovernment();
    render(<GovernmentTab db={fakeDb} nationIdx={2025} />);
    const policies = await screen.findByRole("region", { name: "Policies" });
    const modifiers = within(bodyRows(policies)[1]).getAllByRole("cell")[2];
    await waitFor(() => expect(modifiers).toHaveTextContent("+5% Peasants Levy Size"));
    expect(within(modifiers).getByText("+5% Peasants Levy Size", { exact: false })).toHaveClass(
      "government-tab__effect--good",
    );
    expect(modifiers).toHaveTextContent("+0.1 Monthly Progress to Free Subjects");
  });

  it("switches to Estate Privileges: Estate, Privilege, Modifiers, Granted, in the game's estate order", async () => {
    mockGovernment();
    render(<GovernmentTab db={fakeDb} nationIdx={2025} />);
    fireEvent.click(await screen.findByRole("button", { name: "Estate Privileges" }));

    const privileges = screen.getByRole("region", { name: "Estate Privileges" });
    expect(within(privileges).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Estate",
      "Privilege",
      "Modifiers",
      "Granted",
    ]);
    // One row group per estate, named once, in the game's estate order.
    const groups = within(privileges).getAllByRole("rowgroup").slice(1);
    expect(
      groups.map((g) => [
        within(g).getByRole("rowheader").textContent,
        within(g).getAllByRole("row").map((r) => within(r).getAllByRole("cell")[0].textContent),
      ]),
    ).toEqual([
      ["Nobility", ["Primacy of Nobility"]],
      ["Burghers", ["Formal Guilds"]],
      ["Other", ["Some Modded Privilege"]],
    ]);
    const nobility = within(groups[0]).getAllByRole("cell")[1];
    await waitFor(() => expect(nobility).toHaveTextContent("+5% Discipline"));
    expect(within(nobility).getByText("+100% Nobles Power", { exact: false })).toHaveClass(
      "government-tab__effect--bad",
    );
    expect(screen.queryByRole("region", { name: "Policies" })).not.toBeInTheDocument();
  });

  it("has no hover tooltips or Effects panel by default", async () => {
    mockGovernment();
    render(<GovernmentTab db={fakeDb} nationIdx={2025} />);
    await screen.findByRole("region", { name: "Policies" });
    expect(screen.queryByRole("button", { name: "Expanded Levies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Effects" })).not.toBeInTheDocument();
  });

  // Turned off, not removed (owner decision 2026-09-26).
  it("still offers hover and a pinned Effects panel when turned on", async () => {
    mockGovernment();
    render(<GovernmentTab db={fakeDb} nationIdx={2025} interactiveEffects />);

    const policy = await screen.findByRole("button", { name: "Expanded Levies" });
    fireEvent.mouseEnter(policy.parentElement!);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("+5% Peasants Levy Size"));

    const panel = screen.getByRole("region", { name: "Effects" });
    fireEvent.click(policy);
    expect(policy).toHaveAttribute("aria-pressed", "true");
    expect(panel).toHaveTextContent("Expanded Levies");
    expect(panel).toHaveTextContent("+0.1 Monthly Progress to Free Subjects");
  });

  it("says so when there are no laws or privileges", async () => {
    vi.spyOn(queries, "listNationLaws").mockResolvedValue([]);
    vi.spyOn(queries, "listNationPrivileges").mockResolvedValue([]);
    render(<GovernmentTab db={fakeDb} nationIdx={3} />);
    expect(await screen.findByText("No laws recorded for this nation.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Estate Privileges" }));
    expect(screen.getByText("No estate privileges granted.")).toBeInTheDocument();
  });
});
