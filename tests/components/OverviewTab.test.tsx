import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { OverviewTab } from "../../src/components/Overview/OverviewTab";
import * as queries from "../../src/storage/queries";
import type { SaveDatabase } from "../../src/storage/db";
import type { CountryCard, PopulationMakeup } from "../../src/storage/queries";

const fakeDb = {} as SaveDatabase;

function card(overrides: Partial<CountryCard> = {}): CountryCard {
  return {
    idx: 2025,
    tag: "RUS",
    name: "Russia",
    governmentType: "monarchy",
    treasury: 5493.12008,
    stability: 27.27082,
    governmentPower: 100,
    prestige: 68.51231,
    monthlyIncome: 1024.17507,
    economicBase: 13.47501,
    literacy: 13.2217,
    locationCount: 42,
    worksOfArt: 3,
    totalDebt: 1250.75,
    available: { loans: true, worksOfArt: true },
    derived: new Set(["economicBase", "literacy", "locationCount", "worksOfArt", "totalDebt"]),
    ...overrides,
  };
}

const makeup: PopulationMakeup = {
  religion: [{ key: "18", name: "orthodox", color: [1, 2, 3], size: 2 }],
  culture: [{ key: "884", name: "polesian_culture", color: [4, 5, 6], size: 2 }],
  estate: [
    { key: "tribes_estate", name: null, color: null, size: 1.5 },
    { key: "peasants_estate", name: null, color: null, size: 0.5 },
  ],
  socialClass: [{ key: "tribesmen", name: null, color: null, size: 2 }],
};

function stat(label: string): HTMLElement {
  const section = screen.getByRole("region", { name: "Country card" });
  const term = within(section).getByText(label, { selector: "dt, dt *" });
  return term.closest("div")!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OverviewTab", () => {
  it("shows every Overview stat for the nation (FR-005)", async () => {
    vi.spyOn(queries, "getCountryCard").mockResolvedValue(card());
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);
    render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);

    await screen.findByRole("region", { name: "Country card" });
    expect(screen.getByRole("heading", { name: "Russia" })).toBeInTheDocument();
    expect(stat("Government")).toHaveTextContent("Monarchy");
    expect(stat("Treasury")).toHaveTextContent("5,493.1");
    expect(stat("Economic Base")).toHaveTextContent("13.5");
    expect(stat("Stability")).toHaveTextContent("27.3");
    expect(stat("Legitimacy")).toHaveTextContent("100");
    expect(stat("Prestige")).toHaveTextContent("68.5");
    expect(stat("Works of Art")).toHaveTextContent("3");
    expect(stat("Literacy")).toHaveTextContent("13.2%");
    expect(stat("Locations")).toHaveTextContent("42");
    expect(stat("Total Debt")).toHaveTextContent("1,250.8");
    expect(stat("Monthly Income")).toHaveTextContent("1,024.2");
  });

  it("labels government power by government type (FR-006)", async () => {
    vi.spyOn(queries, "getCountryCard").mockResolvedValue(card({ governmentType: "republic" }));
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);
    render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);
    await screen.findByRole("region", { name: "Country card" });
    expect(stat("Republican Tradition")).toHaveTextContent("100");
    expect(screen.queryByText("Legitimacy")).not.toBeInTheDocument();
  });

  it("shows a confirmed zero debt, and 'not available' when the save has no loan data (FR-027)", async () => {
    const getCard = vi.spyOn(queries, "getCountryCard").mockResolvedValue(card({ totalDebt: 0 }));
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);
    const { rerender } = render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);
    await screen.findByRole("region", { name: "Country card" });
    expect(stat("Total Debt")).toHaveTextContent(/^Total Debt.*0$/);

    getCard.mockResolvedValue(
      card({ idx: 3, totalDebt: null, monthlyIncome: null, available: { loans: false, worksOfArt: true } }),
    );
    rerender(<OverviewTab db={fakeDb} nationIdx={3} inGameDate="1628.8.14" />);
    await waitFor(() =>
      expect(stat("Total Debt")).toHaveTextContent("Not in this save's data — reload the save file"),
    );
    expect(stat("Monthly Income")).toHaveTextContent("Not available");
  });

  it("marks computed stats in text, not color alone (FR-012)", async () => {
    vi.spyOn(queries, "getCountryCard").mockResolvedValue(card());
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);
    render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);
    await screen.findByRole("region", { name: "Country card" });
    expect(stat("Literacy")).toHaveTextContent("computed");
    expect(stat("Total Debt")).toHaveTextContent("computed");
    expect(stat("Treasury")).not.toHaveTextContent("computed");
  });

  it("shows four population pies with readable labels (FR-011)", async () => {
    vi.spyOn(queries, "getCountryCard").mockResolvedValue(card());
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);
    render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);
    for (const caption of ["Religion", "Culture", "Estates", "Social class"]) {
      expect(await screen.findByRole("figure", { name: caption })).toBeInTheDocument();
    }
    const estates = screen.getByRole("figure", { name: "Estates" });
    expect(estates).toHaveTextContent("Tribes75.0%");
    expect(estates).toHaveTextContent("Commoners25.0%");
    expect(screen.getByRole("figure", { name: "Culture" })).toHaveTextContent("Polesian Culture100.0%");
  });

  it("never shows a result for a nation that is no longer selected (FR-004)", async () => {
    let resolveFirst: (c: CountryCard) => void = () => {};
    vi.spyOn(queries, "getCountryCard")
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(card({ idx: 3, name: "Sweden" }));
    vi.spyOn(queries, "getPopulationMakeup").mockResolvedValue(makeup);

    const { rerender } = render(<OverviewTab db={fakeDb} nationIdx={2025} inGameDate="1628.8.14" />);
    rerender(<OverviewTab db={fakeDb} nationIdx={3} inGameDate="1628.8.14" />);
    await screen.findByRole("heading", { name: "Sweden" });
    resolveFirst(card({ name: "Russia" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("heading", { name: "Russia" })).not.toBeInTheDocument();
  });
});
