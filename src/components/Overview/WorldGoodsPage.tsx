import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  decodeGoodProductionByOwner,
  decodeWorldGoods,
  type GoodProductionByOwner,
  type WorldGood,
} from "./marketData";
import { loadLeaderboardCountries, type LeaderboardCountry } from "./leaderboardData";
import { GoodSelect } from "./GoodSelect";
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

// Post-ship, 2026-09-21: the good the page opens on, per the user's
// explicit request. Just a starting point — every good with coverage
// remains reachable via GoodSelect's search.
const DEFAULT_GOOD = "wheat";

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

function formatTotal(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * specs/009-world-goods-production User Story 2: World Goods' own page.
 *
 * Post-ship, 2026-09-21 (explicit user request): the old always-visible
 * `WorldGoodsOverview` data grid is gone. Picking a good is now a
 * `GoodSelect` combobox, scoped to only the goods that actually have a
 * production-share breakdown (RGOs, `hasProductionCoverage`) — since a
 * good without coverage was never selectable to a useful end anyway,
 * scoping the list itself replaces the old "not available" message as
 * how the page makes that boundary clear, rather than offering every
 * good and rejecting most of them after the fact. Defaults to wheat.
 * The selected good's world total (already loaded with the rest of
 * `decodeWorldGoods`) is shown next to the picker; the treemap below is
 * the same `ShareTreemap` as before.
 */
export function WorldGoodsPage({ db }: WorldGoodsPageProps) {
  const [goods, setGoods] = useState<WorldGood[] | null>(null);
  const [selectedGood, setSelectedGood] = useState<string | null>(null);
  const [byOwner, setByOwner] = useState<GoodProductionByOwner[] | null>(null);
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGoods(null);
    setSelectedGood(null);
    setError(null);

    decodeWorldGoods(db)
      .then((loaded) => {
        if (cancelled) return;
        setGoods(loaded);
        const covered = loaded.filter((g) => g.hasProductionCoverage);
        const preferred = covered.find((g) => g.good === DEFAULT_GOOD) ?? covered[0];
        setSelectedGood(preferred?.good ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load world goods.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (!selectedGood) {
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
  }, [db, selectedGood]);

  const entries = useMemo(() => {
    if (!byOwner || !countries) return null;
    return buildEntries(byOwner, countries);
  }, [byOwner, countries]);

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!goods) {
    return <p>Loading world goods…</p>;
  }

  const coveredGoods = goods.filter((g) => g.hasProductionCoverage).map((g) => g.good);
  const selectedTotal = goods.find((g) => g.good === selectedGood)?.total ?? null;

  return (
    <div className="world-goods-page">
      <p className="world-goods-page__caption">
        Raw-material goods (RGOs) with a country-level production breakdown.
      </p>
      {coveredGoods.length === 0 || !selectedGood ? (
        <p className="world-goods-page__not-available">
          No goods in this save have a production-share breakdown available.
        </p>
      ) : (
        <>
          <div className="world-goods-page__controls">
            <GoodSelect goods={coveredGoods} selectedGood={selectedGood} onSelectGood={setSelectedGood} />
            {selectedTotal !== null && (
              <p className="world-goods-page__total">
                World total: <strong>{formatTotal(selectedTotal)}</strong>
              </p>
            )}
          </div>
          {entries ? (
            <ShareTreemap entries={entries} />
          ) : (
            <p>Loading production share…</p>
          )}
        </>
      )}
    </div>
  );
}
