// spec User Story 3 / FR-009: a single search matching entries by name
// or internal key, across categories.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EncyclopediaSearch } from "../../src/components/Overview/EncyclopediaSearch";

const FIXTURE_INDEX = [
  { category: "goods", key: "horses", name: "Horses" },
  { category: "building_types", key: "academy_of_sciences", name: "Academy of Sciences" },
  { category: "religions", key: "test_religion", name: null },
];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => FIXTURE_INDEX })),
  );
}

describe("EncyclopediaSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches an entry by display name, across categories", async () => {
    stubFetch();
    render(<EncyclopediaSearch onSelectEntry={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/search the encyclopedia/i), {
      target: { value: "academy" },
    });
    expect(await screen.findByText("Academy of Sciences")).toBeInTheDocument();
  });

  it("matches an entry by internal key when it has no display name", async () => {
    stubFetch();
    render(<EncyclopediaSearch onSelectEntry={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/search the encyclopedia/i), {
      target: { value: "test_religion" },
    });
    expect(await screen.findByText("test_religion")).toBeInTheDocument();
  });

  it("calls onSelectEntry with the matched entry's category and key", async () => {
    stubFetch();
    const onSelectEntry = vi.fn();
    render(<EncyclopediaSearch onSelectEntry={onSelectEntry} />);
    fireEvent.change(await screen.findByLabelText(/search the encyclopedia/i), {
      target: { value: "horses" },
    });
    fireEvent.click(await screen.findByText("Horses"));
    expect(onSelectEntry).toHaveBeenCalledWith("goods", "horses");
  });
});
