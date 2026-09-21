import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  computeDefaultSelection,
  loadLatestNationMetric,
  loadLeaderboardCountries,
  loadNationHistory,
  type LeaderboardCountry,
  type LeaderboardMetric,
  type LeaderboardPage,
} from "./leaderboardData";
import { LeaderboardChart, type LeaderboardChartSeries } from "./LeaderboardChart";
import { LEADERBOARD_PAGES } from "./LeaderboardSideNav";
import { LeaderboardRankingTable, type LeaderboardRankingEntry } from "./LeaderboardRankingTable";
import { ShareTreemap, type ShareTreemapEntry } from "./ShareTreemap";
import { AddCountryInput } from "./AddCountryInput";
import { RulerHistoryChart } from "./RulerHistoryChart";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./LeaderboardTab.css";

interface LeaderboardTabProps {
  db: SaveDatabase;
  /** Which page is active — owned by `FileLoader.tsx` and rendered via
   * `LeaderboardSideNav` in the shell's `sidenav` grid area, the same
   * way Country Viewer's `activeTab`/`SideNav` split works (state lives
   * in the shell, not in this content component). */
  activePage: LeaderboardPage;
}

type ActiveView = "graph" | "table" | "treemap";

const VIEWS: { id: ActiveView; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "table", label: "Ranking" },
  { id: "treemap", label: "Treemap" },
];

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

export function LeaderboardTab({ db, activePage }: LeaderboardTabProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [history, setHistory] = useState<Map<
    number,
    Map<LeaderboardMetric, { year: number; value: number }[]>
  > | null>(null);
  const [latestMetric, setLatestMetric] = useState<Map<number, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    // Ruler History (below) owns its own countries/history loading —
    // this metric-scoped history query would just be wasted work there.
    if (activePage === "ruler_history") return;
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
  }, [db, selectedIdxs, activePage]);

  // Treemap stretch goal: every real country's latest-recorded value
  // for the active metric — the "world total" the treemap's box areas
  // are shares of. Independent of `selectedIdxs` (it needs every real
  // country, not just the selection) and cheap enough (one small query)
  // to just always keep current, rather than gating it behind actually
  // switching to the Treemap view.
  useEffect(() => {
    if (activePage === "ruler_history") {
      setLatestMetric(null);
      return;
    }
    let cancelled = false;
    setLatestMetric(null);
    loadLatestNationMetric(db, activePage)
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
  }, [db, activePage]);

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

  // Post-ship, 2026-09-21: Ruler History is a fundamentally different
  // data shape (ruler_history, not nation_history) — its own
  // self-contained component, not this tab's graph/ranking/treemap
  // machinery. Everything below this point is narrowed to
  // LeaderboardMetric.
  if (activePage === "ruler_history") {
    return <RulerHistoryChart db={db} />;
  }

  const activeMetric = activePage;
  const activePageInfo = LEADERBOARD_PAGES.find((p) => p.page === activeMetric) ?? LEADERBOARD_PAGES[0];
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
  const treemapEntries: ShareTreemapEntry[] = [];
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
        <div className="leaderboard-tab__title-row">
          <p className="leaderboard-tab__title">{activePageInfo.title}</p>
          <AddCountryInput
            countries={countries}
            selectedIdxs={selectedIdxs}
            onToggle={toggleCountry}
            placeholder="Search countries…"
          />
        </div>
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
      {activeView === "graph" && <LeaderboardChart series={activeSeries} />}
      {activeView === "table" && (
        <LeaderboardRankingTable title={activePageInfo.title} entries={rankingEntries} />
      )}
      {activeView === "treemap" &&
        (latestMetric ? (
          <ShareTreemap entries={treemapEntries} />
        ) : (
          <p>Loading treemap…</p>
        ))}
    </div>
  );
}
