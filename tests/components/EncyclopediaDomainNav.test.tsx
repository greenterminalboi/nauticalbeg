// spec User Story 2: every domain group is browsable, not just Economy
// & Production — this exercises EncyclopediaDomainNav (all five groups
// from a fixture manifest) and EncyclopediaCategoryList (real entries
// for a non-Economy category, fetched through a mocked fetch).
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EncyclopediaDomainNav } from "../../src/components/Overview/EncyclopediaDomainNav";
import { EncyclopediaCategoryList } from "../../src/components/Overview/EncyclopediaCategoryList";
import type { Manifest } from "../../tools/encyclopedia-scraping/types";

const FIXTURE_MANIFEST: Manifest = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  gameVersion: "test",
  dlcs: [],
  domainGroups: [
    { id: "economy-production", label: "Economy & Production", categories: [{ id: "goods", label: "Goods", entryCount: 2, excluded: false }] },
    { id: "government-society", label: "Government & Society", categories: [{ id: "laws", label: "Laws", entryCount: 1, excluded: false }] },
    { id: "culture-religion-characters", label: "Culture, Religion & Characters", categories: [{ id: "religions", label: "Religions", entryCount: 1, excluded: false }] },
    { id: "military-diplomacy", label: "Military & Diplomacy", categories: [{ id: "unit_types", label: "Unit Types", entryCount: 1, excluded: false }] },
    { id: "world-events", label: "World & Events", categories: [{ id: "missions", label: "Missions", entryCount: 1, excluded: false }] },
  ],
  excludedCategories: [],
};

describe("EncyclopediaDomainNav", () => {
  it("shows all five domain groups, not just Economy & Production", () => {
    render(
      <EncyclopediaDomainNav
        manifest={FIXTURE_MANIFEST}
        activeDomainGroupId="economy-production"
        activeCategoryId="goods"
        onSelectDomainGroup={vi.fn()}
        onSelectCategory={vi.fn()}
      />,
    );
    for (const group of FIXTURE_MANIFEST.domainGroups) {
      expect(screen.getByRole("button", { name: new RegExp(group.label) })).toBeInTheDocument();
    }
  });

  it("switching domain groups shows that group's own categories", () => {
    const onSelectDomainGroup = vi.fn();
    render(
      <EncyclopediaDomainNav
        manifest={FIXTURE_MANIFEST}
        activeDomainGroupId="culture-religion-characters"
        activeCategoryId="religions"
        onSelectDomainGroup={onSelectDomainGroup}
        onSelectCategory={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Religions/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Military & Diplomacy/ }));
    expect(onSelectDomainGroup).toHaveBeenCalledWith("military-diplomacy");
  });
});

describe("EncyclopediaCategoryList (non-Economy category)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real entries for a category outside Economy & Production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { category: "religions", key: "test_religion", name: "Test Religion", description: null, source: { kind: "base" }, fields: {}, crossRefs: [] },
        ],
      })),
    );

    render(
      <EncyclopediaCategoryList categoryId="religions" selectedKey={null} onSelectEntry={vi.fn()} />,
    );

    expect(await screen.findByText("Test Religion")).toBeInTheDocument();
  });
});
