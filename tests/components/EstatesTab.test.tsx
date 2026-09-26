import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EstatesTab } from "../../src/components/Overview/EstatesTab";
import * as queries from "../../src/storage/queries";
import type { SaveDatabase } from "../../src/storage/db";
import type { EstateLastMonth, EstateRow } from "../../src/storage/queries";

const fakeDb = {} as SaveDatabase;

const noLastMonth: EstateLastMonth = {
  taxableIncome: null,
  uncontrolledIncome: null,
  cityIncome: null,
  tradeIncome: null,
  foodIncome: null,
  paidTaxes: null,
  popExpense: null,
  buildingExpense: null,
  rebelExpense: null,
  investExpense: null,
  infraExpense: null,
};

const crown: EstateRow = {
  estateType: "crown_estate",
  satisfaction: 1,
  taxRate: null,
  gold: null,
  balance: null,
  wealthImpact: 0,
  lastMonth: noLastMonth,
  populationShare: 0,
};

const nobles: EstateRow = {
  estateType: "nobles_estate",
  satisfaction: 0.38433,
  taxRate: 0.35,
  gold: 36601.16471,
  balance: -95.92923,
  wealthImpact: 1.12571,
  lastMonth: { ...noLastMonth, taxableIncome: 733.68057, tradeIncome: 189.20538, popExpense: 1020.2645, infraExpense: 200 },
  populationShare: 0.0412,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function card(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

function stat(region: HTMLElement, label: string): HTMLElement {
  return within(region).getByText(label, { selector: "dt" }).parentElement!;
}

describe("EstatesTab (specs/018 FR-022)", () => {
  it("shows one card per estate with its standing and last month's money", async () => {
    vi.spyOn(queries, "listNationEstates").mockResolvedValue({ available: true, rows: [crown, nobles] });
    render(<EstatesTab db={fakeDb} nationIdx={2025} />);

    await screen.findByRole("region", { name: "Nobility" });
    const noblesCard = card("Nobility");
    expect(stat(noblesCard, "Satisfaction")).toHaveTextContent("38.4%");
    expect(stat(noblesCard, "Tax Rate")).toHaveTextContent("35%");
    expect(stat(noblesCard, "Population")).toHaveTextContent("4.1%");
    expect(stat(noblesCard, "Gold")).toHaveTextContent("36,601.2");
    expect(stat(noblesCard, "Monthly Balance")).toHaveTextContent("-95.9");
    expect(stat(noblesCard, "Wealth Impact")).toHaveTextContent("1.13");
    expect(stat(noblesCard, "Taxable Income")).toHaveTextContent("733.7");
    expect(stat(noblesCard, "Trade Income")).toHaveTextContent("189.2");
    expect(stat(noblesCard, "Pop Expenses")).toHaveTextContent("1,020.3");
    expect(stat(noblesCard, "Infrastructure")).toHaveTextContent("200");
  });

  it("labels what the save doesn't track for an estate instead of showing zero (FR-027)", async () => {
    vi.spyOn(queries, "listNationEstates").mockResolvedValue({ available: true, rows: [crown, nobles] });
    render(<EstatesTab db={fakeDb} nationIdx={2025} />);

    const crownCard = await screen.findByRole("region", { name: "Crown" });
    expect(stat(crownCard, "Satisfaction")).toHaveTextContent("100%");
    expect(stat(crownCard, "Gold")).toHaveTextContent("Not tracked");
    expect(stat(crownCard, "Tax Rate")).toHaveTextContent("Not tracked");
    // The crown has no last-month record at all: the section says so once.
    expect(crownCard).toHaveTextContent("No income or expense record for this estate.");
  });

  it("says when the save has no estate data at all", async () => {
    vi.spyOn(queries, "listNationEstates").mockResolvedValue({ available: false, rows: [] });
    render(<EstatesTab db={fakeDb} nationIdx={2025} />);
    expect(await screen.findByText("Not in this save's data — reload the save file")).toBeInTheDocument();
  });

  it("says when the nation has no estates", async () => {
    vi.spyOn(queries, "listNationEstates").mockResolvedValue({ available: true, rows: [] });
    render(<EstatesTab db={fakeDb} nationIdx={3} />);
    expect(await screen.findByText("This nation has no estates.")).toBeInTheDocument();
  });
});
