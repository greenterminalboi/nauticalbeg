import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { foldSlices, PopulationPie, type PieSlice } from "../../src/components/Overview/PopulationPie";

function slice(key: string, size: number): PieSlice {
  return { key, label: key.toUpperCase(), size, color: [10, 20, 30] };
}

describe("foldSlices", () => {
  it("folds slices under 2% into one labeled Other slice", () => {
    const folded = foldSlices([slice("a", 90), slice("b", 8.5), slice("c", 1), slice("d", 0.5)]);
    expect(folded.map((s) => s.label)).toEqual(["A", "B", "Other (2 groups)"]);
    expect(folded[2].isOther).toBe(true);
    expect(folded[2].share).toBeCloseTo(0.015, 6);
  });

  it("keeps at most 8 slices: the 7 largest plus Other", () => {
    const many = Array.from({ length: 12 }, (_, i) => slice(`s${i}`, 100 - i));
    const folded = foldSlices(many);
    expect(folded).toHaveLength(8);
    expect(folded.slice(0, 7).map((s) => s.key)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(folded[7]).toMatchObject({ isOther: true, label: "Other (5 groups)" });
  });

  it("shares always sum to 1", () => {
    const folded = foldSlices([slice("a", 3), slice("b", 1), slice("c", 0.01)]);
    expect(folded.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 9);
  });

  it("does not create an Other slice when nothing is folded", () => {
    expect(foldSlices([slice("a", 1), slice("b", 1)]).some((s) => s.isOther)).toBe(false);
  });

  it("lists every group, however small, when folding is off", () => {
    const folded = foldSlices([slice("a", 97), slice("b", 2), slice("c", 0.5), slice("d", 0.5)], false);
    expect(folded.map((s) => s.key)).toEqual(["a", "b", "c", "d"]);
    expect(folded.some((s) => s.isOther)).toBe(false);
  });

  it("returns nothing for no population", () => {
    expect(foldSlices([])).toEqual([]);
    expect(foldSlices([slice("a", 0)])).toEqual([]);
  });
});

describe("PopulationPie", () => {
  it("is a captioned figure whose legend names every slice with its share", () => {
    render(<PopulationPie title="Estates" slices={[slice("tribes", 88.9), slice("commoners", 11.1)]} />);
    const figure = screen.getByRole("figure", { name: "Estates" });
    const items = within(figure).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["TRIBES88.9%", "COMMONERS11.1%"]);
  });

  it("shows an empty state when the nation has no pops", () => {
    render(<PopulationPie title="Culture" slices={[]} />);
    expect(screen.getByRole("figure", { name: "Culture" })).toHaveTextContent("No population data");
  });
});
