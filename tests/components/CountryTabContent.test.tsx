import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountryTabContent } from "../../src/components/Overview/CountryTabContent";
import type { SaveDatabase } from "../../src/storage/db";

// Tabs that render Perspective tables can't load its WASM under jsdom.
vi.mock("../../src/perspective/setup", () => ({ getPerspectiveWorker: vi.fn() }));
vi.mock("@perspective-dev/react", () => ({ PerspectiveViewer: () => null }));

describe("CountryTabContent", () => {
  it.each([
    ["economy", "Economy"],
    ["buildings", "Building Registry"],
    ["characters", "Characters"],
  ] as const)("shows the Coming Soon page for %s (specs/018 FR-003)", (tab, label) => {
    render(
      <CountryTabContent
        db={{} as SaveDatabase}
        activeTab={tab}
        nationIdx={1}
        nations={[]}
        inGameDate="1628.8.14"
        onOpenNation={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(`${label} — Coming Soon`);
  });
});
