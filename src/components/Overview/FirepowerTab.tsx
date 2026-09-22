import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { computeDefaultSelection, loadLeaderboardCountries, type LeaderboardCountry } from "./leaderboardData";
import { decodeSocietalValuesByNation } from "./societalValuesData";
import { MilitaryDoctrineChart, type MilitaryDoctrineAxis, type MilitaryDoctrinePoint } from "./MilitaryDoctrineChart";
import { ArmyStatsTable, type ArmyStatsTableRow } from "./ArmyStatsTable";
import { NavyStatsTable, type NavyStatsTableRow } from "./NavyStatsTable";
import { HeadToHeadTable } from "./HeadToHeadTable";
import { buildArmyHeadToHeadRows, buildNavyHeadToHeadRows } from "./headToHeadRows";
import { computeArmyStats, computeNavyStats, type NationSocietalValueRow } from "./armyNavyStats";
import {
  loadAdvanceSources,
  loadGovernanceSources,
  loadMilitaryScalars,
  loadNavyDamage,
  loadRegimentSummary,
} from "./firepowerData";
import { AddCountryInput } from "./AddCountryInput";
import { CountrySelect } from "./CountrySelect";
import { ArmyCompositionView, type ArmyCompositionRow } from "./ArmyCompositionView";
import type { FirepowerView } from "./FirepowerSideNav";
import "./FirepowerTab.css";

interface FirepowerTabProps {
  db: SaveDatabase;
  /** Which sub-view is active — owned by FileLoader.tsx and rendered via
   * FirepowerSideNav in the shell's sidenav grid area, same split as
   * MarketsTab/MarketsSideNav. */
  activeView: FirepowerView;
}

const MILITARY_DOCTRINE_AXES: MilitaryDoctrineAxis[] = [
  "land_vs_naval",
  "offensive_vs_defensive",
  "quality_vs_quantity",
];

/** Flattens axisReadings' per-nation reading lists into the flat row
 * shape computeArmyStats expects — shared by the Army Stats and Army
 * Composition effects below rather than duplicated. */
function toSocietalValueRows(axisReadings: Map<number, { axis: string; value: number }[]>): NationSocietalValueRow[] {
  const rows: NationSocietalValueRow[] = [];
  for (const [nationIdx, readings] of axisReadings) {
    for (const reading of readings) {
      rows.push({ nationIdx, axis: reading.axis, value: reading.value });
    }
  }
  return rows;
}

/**
 * specs/012-firepower-tab: Factbook's Firepower page — Military Doctrine
 * (User Story 1), Army Stats (User Story 2), Navy Stats (User Story 3).
 * Country selection (computeDefaultSelection + AddCountryInput, same
 * convention as Leaderboard/Markets/Societal Compass) is shared across
 * all three sub-views, owned here rather than per-view, since switching
 * sub-views shouldn't reset which countries are being compared.
 */
export function FirepowerTab({ db, activeView }: FirepowerTabProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [axisReadings, setAxisReadings] = useState<Map<number, { axis: string; value: number }[]> | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [armyStats, setArmyStats] = useState<ArmyStatsTableRow[] | null>(null);
  const [armyStatsError, setArmyStatsError] = useState<string | null>(null);
  const [navyStats, setNavyStats] = useState<NavyStatsTableRow[] | null>(null);
  const [navyStatsError, setNavyStatsError] = useState<string | null>(null);
  // specs/012-firepower-tab (post-ship, explicit user request): Army
  // Composition picks its one country independently of `selectedIdxs`
  // above (that multi-select drives Doctrine/Army/Navy's comparisons;
  // Composition is a single-country detail view, picked via CountrySelect
  // the same way WorldGoodsPage's GoodSelect picks one good).
  const [compositionIdx, setCompositionIdx] = useState<number | null>(null);
  const [compositionStats, setCompositionStats] = useState<ArmyCompositionRow[] | null>(null);
  const [compositionError, setCompositionError] = useState<string | null>(null);
  // specs/012-firepower-tab (post-ship, explicit user request): only
  // meaningful (and only shown) when exactly two countries are selected
  // — with more or fewer selected, the wide table is what's shown.
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCountries(null);
    setAxisReadings(null);
    setSelectedIdxs([]);
    setCompositionIdx(null);
    setError(null);

    Promise.all([loadLeaderboardCountries(db), decodeSocietalValuesByNation(db)])
      .then(([loadedCountries, readingsByNation]) => {
        if (cancelled) return;
        setCountries(loadedCountries);
        setAxisReadings(readingsByNation);
        setSelectedIdxs(computeDefaultSelection(loadedCountries));
        setCompositionIdx(computeDefaultSelection(loadedCountries)[0] ?? loadedCountries[0]?.idx ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Firepower data.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  // specs/012-firepower-tab: Army Stats' own data (regiments/advances/
  // governance sources/scalars) is only fetched once the "army" sub-view
  // is actually active, and re-fetched whenever the selected countries
  // change — no point loading it for every Firepower session, matching
  // Markets' MarketGoodsTable's own "load on demand" precedent.
  useEffect(() => {
    if (activeView !== "army" || !countries || !axisReadings) return;
    let cancelled = false;
    setArmyStats(null);
    setArmyStatsError(null);

    const societalValueRows = toSocietalValueRows(axisReadings);

    Promise.all([
      loadRegimentSummary(db, selectedIdxs),
      loadAdvanceSources(db, selectedIdxs),
      loadGovernanceSources(db, selectedIdxs),
      loadMilitaryScalars(db, selectedIdxs),
    ])
      .then(([regimentRows, advanceRows, governanceRows, scalarRows]) => {
        if (cancelled) return;
        const summaries = computeArmyStats(regimentRows, advanceRows, governanceRows, societalValueRows, scalarRows);
        const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
        const rows: ArmyStatsTableRow[] = summaries
          .map((summary) => {
            const country = countryByIdx.get(summary.nationIdx);
            if (!country) return null;
            return { ...summary, tag: country.tag, name: country.name ?? country.tag, colorRgb: country.color };
          })
          .filter((r): r is ArmyStatsTableRow => r !== null);
        setArmyStats(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArmyStatsError(err instanceof Error ? err.message : "Failed to load Army Stats.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db, activeView, countries, axisReadings, selectedIdxs]);

  // specs/012-firepower-tab: Navy Stats' own data, loaded on demand the
  // same way Army Stats' is above — deliberately independent of it
  // (never fetches nation_reforms/nation_privileges/nation_laws), so
  // Navy Stats works even if Army Stats' own load failed.
  useEffect(() => {
    if (activeView !== "navy" || !countries) return;
    let cancelled = false;
    setNavyStats(null);
    setNavyStatsError(null);

    Promise.all([
      loadRegimentSummary(db, selectedIdxs),
      loadAdvanceSources(db, selectedIdxs),
      loadMilitaryScalars(db, selectedIdxs),
      loadNavyDamage(db, selectedIdxs),
    ])
      .then(([regimentRows, advanceRows, scalarRows, damageRows]) => {
        if (cancelled) return;
        const summaries = computeNavyStats(regimentRows, advanceRows, scalarRows, damageRows);
        const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
        const rows: NavyStatsTableRow[] = summaries
          .map((summary) => {
            const country = countryByIdx.get(summary.nationIdx);
            if (!country) return null;
            return { ...summary, tag: country.tag, name: country.name ?? country.tag, colorRgb: country.color };
          })
          .filter((r): r is NavyStatsTableRow => r !== null);
        setNavyStats(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setNavyStatsError(err instanceof Error ? err.message : "Failed to load Navy Stats.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db, activeView, countries, selectedIdxs]);

  // specs/012-firepower-tab (post-ship, explicit user request): Army
  // Composition's own data — the exact same computeArmyStats pipeline
  // Army Stats uses, just scoped to compositionIdx alone rather than the
  // shared multi-select, so picking a country here never disturbs
  // Doctrine/Army/Navy's own comparison set.
  useEffect(() => {
    if (activeView !== "composition" || compositionIdx === null || !countries || !axisReadings) return;
    let cancelled = false;
    setCompositionStats(null);
    setCompositionError(null);

    const societalValueRows = toSocietalValueRows(axisReadings);
    const idxs = [compositionIdx];

    Promise.all([
      loadRegimentSummary(db, idxs),
      loadAdvanceSources(db, idxs),
      loadGovernanceSources(db, idxs),
      loadMilitaryScalars(db, idxs),
    ])
      .then(([regimentRows, advanceRows, governanceRows, scalarRows]) => {
        if (cancelled) return;
        const summaries = computeArmyStats(regimentRows, advanceRows, governanceRows, societalValueRows, scalarRows);
        const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
        const rows: ArmyCompositionRow[] = summaries
          .map((summary) => {
            const country = countryByIdx.get(summary.nationIdx);
            if (!country) return null;
            return { ...summary, tag: country.tag, name: country.name ?? country.tag, colorRgb: country.color };
          })
          .filter((r): r is ArmyCompositionRow => r !== null);
        setCompositionStats(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCompositionError(err instanceof Error ? err.message : "Failed to load Army Composition.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db, activeView, countries, axisReadings, compositionIdx]);

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) => (current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx]));
  }

  const doctrinePoints = useMemo<MilitaryDoctrinePoint[]>(() => {
    if (!countries || !axisReadings) return [];
    const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
    const points: MilitaryDoctrinePoint[] = [];
    for (const idx of selectedIdxs) {
      const country = countryByIdx.get(idx);
      if (!country) continue;
      const readings = axisReadings.get(idx) ?? [];
      const axes = MILITARY_DOCTRINE_AXES.map((axis) => ({
        axis,
        value: readings.find((r) => r.axis === axis)?.value ?? null,
      }));
      // A country with none of the three military-doctrine axes
      // applicable is excluded entirely, never plotted at a fabricated
      // centrist position on every track.
      if (axes.every((a) => a.value === null)) continue;
      points.push({
        nationIdx: country.idx,
        tag: country.tag,
        name: country.name ?? country.tag,
        colorRgb: country.color,
        axes,
      });
    }
    return points;
  }, [countries, axisReadings, selectedIdxs]);

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!countries) {
    return <p>Loading Firepower data…</p>;
  }

  return (
    <div className="firepower-tab">
      <div className="firepower-tab__controls">
        {activeView === "composition" ? (
          <CountrySelect
            countries={countries}
            selectedIdx={compositionIdx}
            onSelect={setCompositionIdx}
            placeholder="Search countries…"
          />
        ) : (
          <AddCountryInput
            countries={countries}
            selectedIdxs={selectedIdxs}
            onToggle={toggleCountry}
            placeholder="Search countries…"
          />
        )}
        {(activeView === "army" || activeView === "navy") && selectedIdxs.length === 2 && (
          <label className="firepower-tab__compare-toggle">
            <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
            Compare head-to-head
          </label>
        )}
      </div>
      {activeView === "doctrine" &&
        (doctrinePoints.length === 0 ? (
          <p>None of the selected countries have an applicable military-doctrine axis yet.</p>
        ) : (
          <MilitaryDoctrineChart points={doctrinePoints} />
        ))}
      {activeView === "army" &&
        (armyStatsError ? (
          <p role="alert">{armyStatsError}</p>
        ) : !armyStats ? (
          <p>Loading Army Stats…</p>
        ) : armyStats.length === 0 ? (
          <p>None of the selected countries have an army regiment yet.</p>
        ) : compareMode && armyStats.length === 2 ? (
          <HeadToHeadTable countryA={armyStats[0]} countryB={armyStats[1]} rows={buildArmyHeadToHeadRows(armyStats[0], armyStats[1])} />
        ) : (
          <>
            {compareMode && (
              <p className="firepower-tab__compare-note">
                Head-to-head view needs both selected countries to have an army regiment — showing the full table instead.
              </p>
            )}
            <ArmyStatsTable rows={armyStats} />
          </>
        ))}
      {activeView === "navy" &&
        (navyStatsError ? (
          <p role="alert">{navyStatsError}</p>
        ) : !navyStats ? (
          <p>Loading Navy Stats…</p>
        ) : navyStats.length === 0 ? (
          <p>None of the selected countries have a ship yet.</p>
        ) : compareMode && navyStats.length === 2 ? (
          <HeadToHeadTable countryA={navyStats[0]} countryB={navyStats[1]} rows={buildNavyHeadToHeadRows(navyStats[0], navyStats[1])} />
        ) : (
          <>
            {compareMode && (
              <p className="firepower-tab__compare-note">
                Head-to-head view needs both selected countries to have a ship — showing the full table instead.
              </p>
            )}
            <NavyStatsTable rows={navyStats} />
          </>
        ))}
      {activeView === "composition" &&
        (compositionIdx === null ? (
          <p>Search for a country above to view its army composition.</p>
        ) : compositionError ? (
          <p role="alert">{compositionError}</p>
        ) : !compositionStats ? (
          <p>Loading Army Composition…</p>
        ) : compositionStats.length === 0 ? (
          <p>This country has no army regiment yet.</p>
        ) : (
          <ArmyCompositionView row={compositionStats[0]} />
        ))}
    </div>
  );
}
