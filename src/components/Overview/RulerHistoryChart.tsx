import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { getSaveMeta } from "../../storage/queries";
import {
  computeDefaultSelection,
  loadLeaderboardCountries,
  loadRulerHistory,
  type LeaderboardCountry,
  type RulerHistoryPoint,
} from "./leaderboardData";
import { LeaderboardChart, type LeaderboardChartSeries } from "./LeaderboardChart";
import { LeaderboardRankingTable, type LeaderboardRankingEntry } from "./LeaderboardRankingTable";
import { AddCountryInput } from "./AddCountryInput";
import { EmptyState } from "./EmptyState";
import { NEUTRAL_COLOR } from "./mapLayers";
import { resolveRulerFirstName } from "./rulerNames";
import "./RulerHistoryChart.css";

interface RulerHistoryChartProps {
  db: SaveDatabase;
  /** specs/018 (Countries → History): when given, the chart shows exactly
   * these nations and hides its own country search, because the page
   * around it owns one selection shared by all its charts. Omitted (the
   * Leaderboard), the chart picks its own default and has its own search.
   * Must be a stable array (state), not rebuilt every render. */
  selectedIdxs?: readonly number[];
}

interface ScoredPoint {
  year: number;
  score: number;
  regnalNumber: number | null;
  firstNameKey: string | null;
  nickname: string | null;
}

const ROMAN_NUMERALS: readonly [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(n: number): string {
  if (n <= 0) return String(n);
  let remaining = n;
  let result = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

/** The ruler's real display name — resolved first name (via
 * `rulerNames.ts`, generated from the game's own install) plus a roman-
 * numeral regnal number and any nickname, e.g. `Magnus III "Ladulas"`.
 * Falls back to a regnal-number-only label when the name key can't be
 * resolved (an older save, or a name outside this table) — never a
 * fabricated name. */
function rulerDisplayName(point: ScoredPoint): string {
  const resolvedName = resolveRulerFirstName(point.firstNameKey);
  const namePart =
    resolvedName ?? (point.regnalNumber !== null ? `Ruler #${point.regnalNumber}` : "Unknown ruler");
  const regnalPart =
    resolvedName && point.regnalNumber !== null && point.regnalNumber > 0
      ? ` ${toRoman(point.regnalNumber)}`
      : "";
  const nicknamePart = point.nickname ? ` "${point.nickname}"` : "";
  return `${namePart}${regnalPart}${nicknamePart}`;
}

interface NationSeries {
  label: string;
  color: [number, number, number] | null;
  scored: ScoredPoint[];
}

type ActiveView = "graph" | "ranking";

const VIEWS: { id: ActiveView; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "ranking", label: "Ranking" },
];

// A ruler's combined skill score (adm + dip + mil) — each stat 0-100 by
// game design, so the sum is always within this real, known range.
const SCORE_RANGE: readonly [number, number] = [0, 300];

// Explicit user request: the x-axis is "deadset" to the campaign's own
// start year, not auto-scaled to whatever the current selection's
// earliest reign happens to be.
const CAMPAIGN_START_YEAR = 1337;

/** 'YYYY.M.D' (the save's own current date, `save_meta.in_game_date`) ->
 * a decimal year, same conversion `leaderboardData.ts`'s
 * `parseGameDateToDecimalYear` uses for ruler reign-start dates — kept
 * as its own copy here since that one isn't exported (this is the only
 * other caller). */
function parseGameDateToDecimalYear(dateStr: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(dateStr);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  return Number(yearStr) + (Number(monthStr) - 1) / 12 + (Number(dayStr) - 1) / 365;
}

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Time-weighted average of a nation's scored reigns, over the span
 * this data actually covers (its earliest recorded reign through
 * `currentYear`) — in practice "from 1337 til now" for a player
 * nation, which exists from the campaign's start. Weighted by each
 * ruler's real reign length (the gap to the next reign's start, or to
 * `currentYear` for the last one), not a plain per-ruler average —
 * two rulers of 80 and 2 years shouldn't count equally. */
function averageScore(scored: readonly ScoredPoint[], currentYear: number): number | null {
  if (scored.length === 0) return null;
  let weightedSum = 0;
  for (let i = 0; i < scored.length; i++) {
    const start = scored[i].year;
    const end = i + 1 < scored.length ? scored[i + 1].year : currentYear;
    weightedSum += scored[i].score * Math.max(end - start, 0);
  }
  const totalDuration = currentYear - scored[0].year;
  return totalDuration > 0 ? weightedSum / totalDuration : scored[scored.length - 1].score;
}

/**
 * specs/006-country-leaderboard, post-ship 2026-09-21 (Ruler History
 * stretch goal): a step chart of the selected nations' combined ruler
 * score (adm+dip+mil, 0-300) across the whole game, from
 * `ruler_history`. Reuses `LeaderboardChart` (its `step`/`yAxisRange`/
 * `xAxisRange`/`tooltipFormatter` props) rather than a bespoke chart —
 * same multi-series line-chart shape, just stepped and fixed-range
 * instead of smooth and auto-scaled.
 *
 * Post-ship, 2026-09-21 (same day, explicit user request): country
 * selection works exactly like `LeaderboardTab`'s own graph —
 * `computeDefaultSelection` (every human-played country, or a non-empty
 * fallback if none), plus `AddCountryInput` — now the standard
 * country-selection control across every Leaderboard chart — to add or
 * remove any other real country on demand. The x-axis is a fixed
 * `[1337, current save year]` domain regardless of selection —
 * "deadset," per that request — rather than scaling to whichever
 * selected countries happen to have the earliest/latest reigns.
 *
 * A ruler's last reign's step is extended to the save's own current
 * date (`save_meta.in_game_date`), so the line reads as "this is who's
 * ruling right now" rather than stopping abruptly at that ruler's own
 * reign-start point. The tooltip uses a custom `tooltipFormatter`
 * (rather than `LeaderboardChart`'s default nearest-point lookup) to
 * show the ruler actually reigning at the exact hovered x — the
 * correct step-line value, not whichever of the two flanking points is
 * pixel-nearest — along with that ruler's real name (`rulerNames.ts`,
 * generated from the game's own install; falls back to a regnal-
 * number-only label rather than a fabricated name when the key can't
 * be resolved).
 *
 * A Ranking view (mirroring `LeaderboardTab`'s own Graph/Ranking
 * toggle) shows each selected nation's time-weighted average ruler
 * skill from 1337 til now, alongside their current ruler's skill.
 */
export function RulerHistoryChart({ db, selectedIdxs: controlledIdxs }: RulerHistoryChartProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [ownSelectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const selectedIdxs = controlledIdxs ?? ownSelectedIdxs;
  const [history, setHistory] = useState<Map<number, RulerHistoryPoint[]> | null>(null);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("graph");

  useEffect(() => {
    let cancelled = false;
    setCountries(null);
    setSelectedIdxs([]);
    setHistory(null);
    setCurrentYear(null);
    setError(null);

    Promise.all([loadLeaderboardCountries(db), getSaveMeta(db)])
      .then(([countryList, meta]) => {
        if (cancelled) return;
        setCountries(countryList);
        setSelectedIdxs(computeDefaultSelection(countryList));
        setCurrentYear(parseGameDateToDecimalYear(meta.inGameDate ?? ""));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ruler history.");
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
    loadRulerHistory(db, selectedIdxs)
      .then((loaded) => {
        if (!cancelled) setHistory(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ruler history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, selectedIdxs]);

  const countryByIdx = useMemo(() => {
    const map = new Map<number, LeaderboardCountry>();
    for (const c of countries ?? []) map.set(c.idx, c);
    return map;
  }, [countries]);

  // One entry per selected country that has at least one scored ruler
  // term — the shared source both the chart series and the ranking
  // table are built from, plus the tooltip's own step-lookup.
  const perNation = useMemo(() => {
    const map = new Map<number, NationSeries>();
    if (!history) return map;
    for (const idx of selectedIdxs) {
      const country = countryByIdx.get(idx);
      if (!country) continue;
      const points = history.get(idx) ?? [];
      const scored = points
        .filter((p): p is RulerHistoryPoint & { score: number } => p.score !== null)
        .map((p) => ({
          year: p.year,
          score: p.score,
          regnalNumber: p.regnalNumber,
          firstNameKey: p.firstNameKey,
          nickname: p.nickname,
        }));
      if (scored.length === 0) continue;
      map.set(idx, { label: countryLabel(country), color: country.color, scored });
    }
    return map;
  }, [selectedIdxs, countryByIdx, history]);

  const series = useMemo<LeaderboardChartSeries[]>(() => {
    return Array.from(perNation.entries()).map(([idx, { label, color, scored }]) => {
      const chartPoints = scored.map((p) => ({ year: p.year, value: p.score }));
      const last = scored[scored.length - 1];
      if (currentYear !== null && currentYear > last.year) {
        chartPoints.push({ year: currentYear, value: last.score });
      }
      return { nationIdx: idx, label, color, points: chartPoints };
    });
  }, [perNation, currentYear]);

  const rankingEntries = useMemo<LeaderboardRankingEntry[]>(() => {
    if (currentYear === null) return [];
    return Array.from(perNation.entries()).map(([idx, { label, color, scored }]) => ({
      nationIdx: idx,
      label,
      color,
      value: averageScore(scored, currentYear),
      secondaryValue: scored[scored.length - 1].score,
    }));
  }, [perNation, currentYear]);

  const tooltipFormatter = useMemo(() => {
    return (params: unknown) => {
      const list = Array.isArray(params) ? params : [params];
      const axisValue = (list[0] as { axisValue?: number } | undefined)?.axisValue;
      if (typeof axisValue !== "number") return "";

      const lines = [`Year ${axisValue.toFixed(2)}`];
      for (const { label, color, scored } of perNation.values()) {
        // The ruler actually reigning at axisValue: the latest point
        // whose reign had already started by that x — `scored` is
        // sorted ascending by year (the query's own ORDER BY), so a
        // linear scan is fine at this size (a handful of selected
        // countries, each with a handful of reigns).
        let current: ScoredPoint | null = null;
        for (const p of scored) {
          if (p.year <= axisValue) current = p;
          else break;
        }
        if (!current) continue; // this nation's data doesn't start until after axisValue
        const swatch = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorString(color ?? NEUTRAL_COLOR)};margin-right:4px;"></span>`;
        lines.push(`${swatch}${label} — ${rulerDisplayName(current)}: ${current.score.toFixed(1)}`);
      }
      return lines.join("<br/>");
    };
  }, [perNation]);

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) =>
      current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx],
    );
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!countries) {
    return <p>Loading ruler history…</p>;
  }
  if (countries.length === 0) {
    return <EmptyState subject="real countries" />;
  }

  const xAxisRange: readonly [number, number] = [
    CAMPAIGN_START_YEAR,
    currentYear !== null ? Math.ceil(currentYear) : CAMPAIGN_START_YEAR,
  ];

  return (
    <div className="ruler-history-chart">
      <div className="ruler-history-chart__controls">
        <div className="ruler-history-chart__title-row">
          <p className="ruler-history-chart__title">Ruler History</p>
          {!controlledIdxs && (
            <AddCountryInput
              countries={countries}
              selectedIdxs={selectedIdxs}
              onToggle={toggleCountry}
              placeholder="Search countries…"
            />
          )}
        </div>
        <div className="ruler-history-chart__view-toggle" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={
                v.id === activeView
                  ? "ruler-history-chart__view-button ruler-history-chart__view-button--active"
                  : "ruler-history-chart__view-button"
              }
              aria-pressed={v.id === activeView}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {!history ? (
        <p>Loading ruler history…</p>
      ) : activeView === "graph" ? (
        <LeaderboardChart
          series={series}
          step
          yAxisRange={SCORE_RANGE}
          xAxisRange={xAxisRange}
          tooltipFormatter={tooltipFormatter}
        />
      ) : (
        <LeaderboardRankingTable
          title="Avg Ruler Skill"
          secondaryTitle="Current Ruler Skill"
          entries={rankingEntries}
        />
      )}
    </div>
  );
}
