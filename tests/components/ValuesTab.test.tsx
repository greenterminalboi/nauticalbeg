import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ValuesTab } from "../../src/components/Overview/ValuesTab";
import * as societalValuesData from "../../src/components/Overview/societalValuesData";
import type { SaveDatabase } from "../../src/storage/db";

const fakeDb = {} as SaveDatabase;

function readings() {
  return new Map([
    [
      2025,
      [
        { axis: "centralization_vs_decentralization", value: -41.23 },
        { axis: "aristocracy_vs_plutocracy", value: 67.5 },
        { axis: "land_vs_naval", value: 0 },
      ],
    ],
    // Another nation's axis tells us the save has it: RUS lacks it.
    [3, [{ axis: "absolutism_vs_liberalism", value: 10 }]],
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ValuesTab (specs/018 FR-023)", () => {
  it("shows each of the nation's societal values between its two poles", async () => {
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(readings());
    render(<ValuesTab db={fakeDb} nationIdx={2025} />);

    const central = await screen.findByRole("meter", { name: "Centralization vs Decentralization" });
    expect(central).toHaveAttribute("aria-valuenow", "-41.23");
    expect(central.closest("li")).toHaveTextContent("41 toward Centralization");

    const aristocracy = screen.getByRole("meter", { name: "Aristocracy vs Plutocracy" });
    expect(aristocracy.closest("li")).toHaveTextContent("68 toward Plutocracy");

    // An axis only in the save's data, not the compass config: poles from its key.
    const land = screen.getByRole("meter", { name: "Land vs Naval" });
    expect(land.closest("li")).toHaveTextContent("Balanced");
  });

  it("lists axes the nation doesn't have as not applicable, never as a neutral reading", async () => {
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(readings());
    render(<ValuesTab db={fakeDb} nationIdx={2025} />);

    const notApplicable = await screen.findByRole("region", { name: "Not applicable" });
    expect(within(notApplicable).getByText("Absolutism vs Liberalism")).toBeInTheDocument();
    expect(screen.queryByRole("meter", { name: "Absolutism vs Liberalism" })).not.toBeInTheDocument();
  });

  it("says so when the nation has no societal values", async () => {
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(new Map());
    render(<ValuesTab db={fakeDb} nationIdx={1} />);
    expect(await screen.findByText("This nation has no societal values.")).toBeInTheDocument();
  });
});
