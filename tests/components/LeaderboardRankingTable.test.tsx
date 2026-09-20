import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaderboardRankingTable } from "../../src/components/Overview/LeaderboardRankingTable";

describe("LeaderboardRankingTable", () => {
  it("ranks entries descending by value, with a numeric rank column", () => {
    render(
      <LeaderboardRankingTable
        title="Population"
        entries={[
          { nationIdx: 1, label: "RUS", color: [183, 136, 27], value: 40 },
          { nationIdx: 2, label: "FRA", color: [10, 20, 30], value: 99 },
          { nationIdx: 3, label: "SCA", color: null, value: 12 },
        ]}
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Country" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Population" })).toBeInTheDocument();

    // FRA (99) > RUS (40) > SCA (12) — row order and rank number agree.
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows[0]).toHaveTextContent(/^1.*FRA/);
    expect(rows[1]).toHaveTextContent(/^2.*RUS/);
    expect(rows[2]).toHaveTextContent(/^3.*SCA/);
  });

  it("ranks a country with no data (null value) last, shown as a dash for both rank and value rather than a fabricated 0", () => {
    render(
      <LeaderboardRankingTable
        title="Population"
        entries={[
          { nationIdx: 1, label: "RUS", color: [183, 136, 27], value: null },
          { nationIdx: 2, label: "FRA", color: [10, 20, 30], value: 5 },
        ]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent(/^1.*FRA/);
    expect(rows[1]).toHaveTextContent("RUS");
    expect(rows[1]).toHaveTextContent("—");
  });
});
