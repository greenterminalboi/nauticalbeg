import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { computeDefaultSelection, loadLeaderboardCountries, type LeaderboardCountry } from "./leaderboardData";
import { decodeSocietalValuesByNation } from "./societalValuesData";
import { MilitaryDoctrineChart, type MilitaryDoctrinePoint } from "./MilitaryDoctrineChart";
import { ArmyStatsTable, type ArmyStatsTableRow } from "./ArmyStatsTable";
import { NavyStatsTable, type NavyStatsTableRow } from "./NavyStatsTable";
import { HeadToHeadTable } from "./HeadToHeadTable";
import { buildArmyHeadToHeadRows, buildNavyHeadToHeadRows } from "./headToHeadRows";
import { buildDoctrinePoints, loadArmyProfiles, loadNavyProfiles, toSocietalValueRows } from "./firepowerData";
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

    loadArmyProfiles(db, selectedIdxs, countries, toSocietalValueRows(axisReadings))
      .then((rows) => {
        if (!cancelled) setArmyStats(rows);
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

    loadNavyProfiles(db, selectedIdxs, countries)
      .then((rows) => {
        if (!cancelled) setNavyStats(rows);
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

    loadArmyProfiles(db, [compositionIdx], countries, toSocietalValueRows(axisReadings))
      .then((rows) => {
        if (!cancelled) setCompositionStats(rows);
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

  const doctrinePoints = useMemo<MilitaryDoctrinePoint[]>(
    () => (countries && axisReadings ? buildDoctrinePoints(selectedIdxs, countries, axisReadings) : []),
    [countries, axisReadings, selectedIdxs],
  );

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
