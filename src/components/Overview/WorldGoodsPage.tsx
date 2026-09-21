import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { decodeGoodProductionByOwner, type GoodProductionByOwner } from "./marketData";
import { loadLeaderboardCountries, type LeaderboardCountry } from "./leaderboardData";
import { WorldGoodsOverview } from "./WorldGoodsOverview";
import { ShareTreemap, type ShareTreemapEntry } from "./ShareTreemap";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./WorldGoodsPage.css";

interface WorldGoodsPageProps {
  db: SaveDatabase;
}

// specs/009-world-goods-production contracts/ui-components.md: enough
// to show every major producer of a typical good without degenerating
// into dozens of illegible slivers (FR-009).
const MAX_INDIVIDUAL_PRODUCERS = 15;

function buildEntries(
  byOwner: readonly GoodProductionByOwner[],
  countries: readonly LeaderboardCountry[],
): ShareTreemapEntry[] {
  const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
  const realEntries: ShareTreemapEntry[] = [];
  let unattributed = 0;

  for (const { ownerIdx, amount } of byOwner) {
    const country = ownerIdx !== null ? countryByIdx.get(ownerIdx) : undefined;
    if (country) {
      realEntries.push({ id: country.idx, label: country.name ?? country.tag, color: country.color, value: amount });
    } else {
      // No owner at all, or an owner not in the country_type = 'Real'
      // list loadLeaderboardCountries already filters to (Pirates, a
      // rebel faction, etc.) — never dropped, never folded into a real
      // country's own share (FR-008).
      unattributed += amount;
    }
  }

  realEntries.sort((a, b) => b.value - a.value);
  const top = realEntries.slice(0, MAX_INDIVIDUAL_PRODUCERS);
  const rest = realEntries.slice(MAX_INDIVIDUAL_PRODUCERS);

  const entries = [...top];
  if (rest.length > 0) {
    entries.push({
      id: "other-producers",
      label: "Other producers",
      color: NEUTRAL_COLOR,
      value: rest.reduce((sum, e) => sum + e.value, 0),
    });
  }
  if (unattributed > 0) {
    entries.push({ id: "unattributed", label: "Unattributed", color: NEUTRAL_COLOR, value: unattributed });
  }
  return entries;
}

/**
 * specs/009-world-goods-production User Story 2: World Goods' own page
 * — always renders `WorldGoodsOverview`; selecting a good with
 * production-share coverage reveals a `ShareTreemap` of that good's
 * production by country. `selectedGoodCoverage` arrives directly from
 * `WorldGoodsOverview`'s click payload (the clicked row's own
 * `has_production_coverage` column) rather than a second fetch/lookup
 * — an implementation-time simplification over the original contract,
 * since the grid already carries this value with no extra round trip
 * and no race between selecting a good and a separate list loading.
 */
export function WorldGoodsPage({ db }: WorldGoodsPageProps) {
  const [selectedGood, setSelectedGood] = useState<string | null>(null);
  const [selectedGoodCoverage, setSelectedGoodCoverage] = useState(false);
  const [byOwner, setByOwner] = useState<GoodProductionByOwner[] | null>(null);
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);

  function handleSelectGood(good: string, hasProductionCoverage: boolean) {
    setSelectedGood(good);
    setSelectedGoodCoverage(hasProductionCoverage);
  }

  useEffect(() => {
    if (!selectedGood || !selectedGoodCoverage) {
      setByOwner(null);
      setCountries(null);
      return;
    }
    let cancelled = false;
    Promise.all([decodeGoodProductionByOwner(db, selectedGood), loadLeaderboardCountries(db)]).then(
      ([ownerRows, countryList]) => {
        if (cancelled) return;
        setByOwner(ownerRows);
        setCountries(countryList);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, selectedGood, selectedGoodCoverage]);

  const entries = useMemo(() => {
    if (!byOwner || !countries) return null;
    return buildEntries(byOwner, countries);
  }, [byOwner, countries]);

  return (
    <div className="world-goods-page">
      <WorldGoodsOverview db={db} selectedGood={selectedGood} onSelectGood={handleSelectGood} />
      {selectedGood &&
        (selectedGoodCoverage ? (
          entries ? (
            <ShareTreemap title={selectedGood} entries={entries} />
          ) : (
            <p>Loading production share…</p>
          )
        ) : (
          <p className="world-goods-page__not-available">
            Production-share data isn't available for {selectedGood} yet.
          </p>
        ))}
    </div>
  );
}
