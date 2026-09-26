import { useEffect, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  buildDoctrinePoints,
  loadArmyProfiles,
  loadNavyProfiles,
  toSocietalValueRows,
  type ArmyProfile,
  type NavyProfile,
} from "./firepowerData";
import { loadLeaderboardCountries } from "./leaderboardData";
import { decodeSocietalValuesByNation } from "./societalValuesData";
import { ArmyCompositionView } from "./ArmyCompositionView";
import { MilitaryDoctrineChart, type MilitaryDoctrinePoint } from "./MilitaryDoctrineChart";
import { NavyCompositionView } from "./NavyCompositionView";
import "./MilitaryTab.css";

interface MilitaryTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

interface MilitaryData {
  idx: number;
  army: ArmyProfile | null;
  navy: NavyProfile | null;
  doctrine: MilitaryDoctrinePoint[];
}

/**
 * Factbook → Countries → Military (specs/018 US5): the selected nation's
 * military doctrine, army composition and naval composition. The numbers
 * come from the same loaders Firepower uses (firepowerData.ts), so the
 * two views always agree.
 */
export function MilitaryTab({ db, nationIdx }: MilitaryTabProps) {
  const [data, setData] = useState<MilitaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      const [countries, readings] = await Promise.all([loadLeaderboardCountries(db), decodeSocietalValuesByNation(db)]);
      const idxs = [nationIdx];
      const [army, navy] = await Promise.all([
        loadArmyProfiles(db, idxs, countries, toSocietalValueRows(readings)),
        loadNavyProfiles(db, idxs, countries),
      ]);
      if (cancelled) return;
      setData({
        idx: nationIdx,
        army: army[0] ?? null,
        navy: navy[0] ?? null,
        doctrine: buildDoctrinePoints(idxs, countries, readings),
      });
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load military data.");
    });
    return () => {
      cancelled = true;
    };
  }, [db, nationIdx]);

  if (error) return <p role="alert">{error}</p>;
  if (!data || data.idx !== nationIdx) return <p>Loading military…</p>;

  return (
    <div className="military-tab">
      <section className="military-tab__section">
        <h2 className="military-tab__heading">Military Doctrine</h2>
        {data.doctrine.length > 0 ? (
          <MilitaryDoctrineChart points={data.doctrine} />
        ) : (
          <p>This nation has no military doctrine values.</p>
        )}
      </section>
      <section className="military-tab__section">
        <h2 className="military-tab__heading">Army</h2>
        {data.army ? <ArmyCompositionView row={data.army} /> : <p>This nation has no army regiments.</p>}
      </section>
      <section className="military-tab__section">
        <h2 className="military-tab__heading">Navy</h2>
        <NavyCompositionView row={data.navy} />
      </section>
    </div>
  );
}
