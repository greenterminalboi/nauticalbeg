import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  loadLatestNationMetric,
  loadLeaderboardCountries,
  loadNationHistory,
  type LeaderboardCountry,
  type LeaderboardMetric,
} from "./leaderboardData";
import { LeaderboardChart, type LeaderboardChartSeries } from "./LeaderboardChart";
import { LEADERBOARD_PAGES } from "./LeaderboardSideNav";
import { LeaderboardRankingTable, type LeaderboardRankingEntry } from "./LeaderboardRankingTable";
import { LeaderboardTreemap, type LeaderboardTreemapEntry } from "./LeaderboardTreemap";
import { CountrySearchOverlay } from "./CountrySearchOverlay";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./LeaderboardTab.css";

interface LeaderboardTabProps {
  db: SaveDatabase;
  /** Which metric's page is active — owned by `FileLoader.tsx` and
   * rendered via `LeaderboardSideNav` in the shell's `sidenav` grid
   * area, the same way Country Viewer's `activeTab`/`SideNav` split
   * works (state lives in the shell, not in this content component). */
  activeMetric: LeaderboardMetric;
}

type ActiveView = "graph" | "table" | "treemap";

const VIEWS: { id: ActiveView; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "table", label: "Ranking" },
  { id: "treemap", label: "Treemap" },
];

// spec FR-008: on first open, pre-select every human-played country. If
// the save has no human-played country recorded at all, fall back to
// some other non-empty, meaningful default (an implementation choice
// per spec's Assumptions) — the first few countries in the already-
// loaded, alphabetically-sorted list, rather than issuing an extra
// save-wide history query just to rank by population (which would
// contradict listNationHistoryArrow's deliberately-scoped design,
// contracts/leaderboard-data-contract.md).
const FALLBACK_SELECTION_SIZE = 5;

function computeDefaultSelection(countries: LeaderboardCountry[]): number[] {
  const humanPlayed = countries.filter((c) => c.isHumanPlayed).map((c) => c.idx);
  if (humanPlayed.length > 0) return humanPlayed;
  return countries.slice(0, FALLBACK_SELECTION_SIZE).map((c) => c.idx);
}

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

export function LeaderboardTab({ db, activeMetric }: LeaderboardTabProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [history, setHistory] = useState<Map<
    number,
    Map<LeaderboardMetric, { year: number; value: number }[]>
  > | null>(null);
  const [latestMetric, setLatestMetric] = useState<Map<number, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("graph");

  useEffect(() => {
    let cancelled = false;
    setCountries(null);
    setSelectedIdxs([]);
    setHistory(null);
    setError(null);

    loadLeaderboardCountries(db)
      .then((loaded) => {
        if (cancelled) return;
        setCountries(loaded);
        setSelectedIdxs(computeDefaultSelection(loaded));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load countries.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (selectedIdxs.length === 0) {
      setHistory(new Map());
      return;
    }
    let cancelled = false;
    loadNationHistory(db, selectedIdxs)
      .then((loaded) => {
        if (!cancelled) setHistory(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load country history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, selectedIdxs]);

  // Treemap stretch goal: every real country's latest-recorded value
  // for the active metric — the "world total" the treemap's box areas
  // are shares of. Independent of `selectedIdxs` (it needs every real
  // country, not just the selection) and cheap enough (one small query)
  // to just always keep current, rather than gating it behind actually
  // switching to the Treemap view.
  useEffect(() => {
    let cancelled = false;
    setLatestMetric(null);
    loadLatestNationMetric(db, activeMetric)
      .then((loaded) => {
        if (!cancelled) setLatestMetric(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load latest values.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, activeMetric]);

  const countryByIdx = useMemo(() => {
    const map = new Map<number, LeaderboardCountry>();
    for (const c of countries ?? []) map.set(c.idx, c);
    return map;
  }, [countries]);

  function seriesFor(metric: LeaderboardMetric): LeaderboardChartSeries[] {
    if (!history) return [];
    return selectedIdxs
      .map((idx): LeaderboardChartSeries | null => {
        const country = countryByIdx.get(idx);
        if (!country) return null;
        const points = history.get(idx)?.get(metric) ?? [];
        return {
          nationIdx: idx,
          label: countryLabel(country),
          color: country.color,
          points,
        };
      })
      .filter((s): s is LeaderboardChartSeries => s !== null);
  }

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) =>
      current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx],
    );
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!countries) {
    return <p>Loading leaderboard…</p>;
  }

  const activePage = LEADERBOARD_PAGES.find((p) => p.metric === activeMetric) ?? LEADERBOARD_PAGES[0];
  const activeSeries = seriesFor(activeMetric);
  const rankingEntries: LeaderboardRankingEntry[] = activeSeries.map((s) => ({
    nationIdx: s.nationIdx,
    label: s.label,
    color: s.color,
    // Series points are already sorted ascending by year (contract) and
    // leading-zero-suppressed — the last one is the latest real value.
    value: s.points.length > 0 ? s.points[s.points.length - 1].value : null,
  }));

  // Treemap entries: one box per selected country that has a latest
  // value (spec direction: "current players who all existed [as of]
  // the last year"), plus one grey "Other" box summing every real
  // country NOT selected that also reported a value that year — every
  // box's area is then its exact share of that combined world total.
  const selectedSet = new Set(selectedIdxs);
  const treemapEntries: LeaderboardTreemapEntry[] = [];
  let otherTotal = 0;
  if (latestMetric) {
    for (const [nationIdx, value] of latestMetric) {
      if (selectedSet.has(nationIdx)) {
        const country = countryByIdx.get(nationIdx);
        if (country) {
          treemapEntries.push({
            id: nationIdx,
            label: countryLabel(country),
            color: country.color,
            value,
          });
        }
      } else {
        otherTotal += value;
      }
    }
    if (otherTotal > 0) {
      treemapEntries.push({ id: "other", label: "Other", color: NEUTRAL_COLOR, value: otherTotal });
    }
  }

  return (
    <div className="leaderboard-tab">
      <div className="leaderboard-tab__controls">
        <button
          type="button"
          className="leaderboard-tab__search-toggle"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((open) => !open)}
        >
          {searchOpen ? "Close search" : "Search countries"}
        </button>
        <div className="leaderboard-tab__view-toggle" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={
                v.id === activeView
                  ? "leaderboard-tab__view-button leaderboard-tab__view-button--active"
                  : "leaderboard-tab__view-button"
              }
              aria-pressed={v.id === activeView}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {searchOpen && (
        <CountrySearchOverlay
          countries={countries}
          selectedIdxs={selectedIdxs}
          onToggle={toggleCountry}
        />
      )}
      {activeView === "graph" && <LeaderboardChart title={activePage.title} series={activeSeries} />}
      {activeView === "table" && (
        <LeaderboardRankingTable title={activePage.title} entries={rankingEntries} />
      )}
      {activeView === "treemap" &&
        (latestMetric ? (
          <LeaderboardTreemap title={activePage.title} entries={treemapEntries} />
        ) : (
          <p>Loading treemap…</p>
        ))}
    </div>
  );
}
