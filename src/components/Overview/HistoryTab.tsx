import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  loadLeaderboardCountries,
  loadNationHistory,
  type LeaderboardCountry,
  type LeaderboardMetric,
  type LeaderboardSeriesPoint,
} from "./leaderboardData";
import { AddCountryInput } from "./AddCountryInput";
import { LeaderboardChart, type LeaderboardChartSeries } from "./LeaderboardChart";
import { RulerHistoryChart } from "./RulerHistoryChart";
import "./HistoryTab.css";

interface HistoryTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

const METRICS: { metric: LeaderboardMetric; title: string }[] = [
  { metric: "population", title: "Population" },
  { metric: "economical_base", title: "Economic Base" },
  { metric: "tax_base", title: "Tax Base" },
];

type History = Map<number, Map<LeaderboardMetric, LeaderboardSeriesPoint[]>>;

/**
 * Factbook → Countries → History (specs/018 US2): the Leaderboard's
 * population, economic base, tax base and ruler history charts on one
 * page. One selection drives all four. It starts as just the nation
 * picked in the nation selector, and resets to it whenever that changes.
 */
export function HistoryTab({ db, nationIdx }: HistoryTabProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([nationIdx]);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Keep the same array when nothing changed, so mounting doesn't
    // fetch the history twice.
    setSelectedIdxs((current) => (current.length === 1 && current[0] === nationIdx ? current : [nationIdx]));
  }, [nationIdx]);

  useEffect(() => {
    let cancelled = false;
    loadLeaderboardCountries(db)
      .then((loaded) => {
        if (!cancelled) setCountries(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load countries.");
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    loadNationHistory(db, selectedIdxs)
      .then((loaded) => {
        if (!cancelled) setHistory(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load country history.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, selectedIdxs]);

  const countryByIdx = useMemo(
    () => new Map((countries ?? []).map((c) => [c.idx, c] as const)),
    [countries],
  );

  function seriesFor(metric: LeaderboardMetric): LeaderboardChartSeries[] {
    if (!history) return [];
    return selectedIdxs.flatMap((idx) => {
      const country = countryByIdx.get(idx);
      if (!country) return [];
      return [{ nationIdx: idx, label: country.name ?? country.tag, color: country.color, points: history.get(idx)?.get(metric) ?? [] }];
    });
  }

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) => (current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx]));
  }

  if (error) return <p role="alert">{error}</p>;
  if (!countries) return <p>Loading history…</p>;

  return (
    <div className="history-tab">
      <div className="history-tab__controls">
        <AddCountryInput
          countries={countries}
          selectedIdxs={selectedIdxs}
          onToggle={toggleCountry}
          placeholder="Add a country to compare…"
        />
      </div>
      <div className="history-tab__charts">
        {METRICS.map(({ metric, title }) => (
          <section key={metric} className="history-tab__chart">
            <LeaderboardChart title={title} series={seriesFor(metric)} />
          </section>
        ))}
      </div>
      <RulerHistoryChart db={db} selectedIdxs={selectedIdxs} />
    </div>
  );
}
