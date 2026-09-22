import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import {
  buildChordViewModel,
  computeDefaultSelection,
  filterByRelationType,
  loadDiplomaticRelations,
  loadLeaderboardCountries,
  loadRelationTrust,
  RELATION_TYPES,
  type DiplomacyCountry,
  type DiplomaticRelationship,
  type NationRelationTrust,
  type RelationType,
} from "./diplomacyData";
import { DiplomacyChordChart } from "./DiplomacyChordChart";
import { DiplomacyFilters } from "./DiplomacyFilters";
import { EmptyState } from "./EmptyState";
import { computeHugboxClusters } from "./hugboxClustering";
import "./DiplomacyTab.css";

interface DiplomacyTabProps {
  db: SaveDatabase;
}

interface RelationshipData {
  relationships: DiplomaticRelationship[];
  trust: NationRelationTrust[];
}

/**
 * specs/013-diplomatic-relations-chord: Factbook's "Diplomacy" tab
 * (contracts/ui.md) — the chord diagram's own page, alongside Wars/
 * Leaderboard/Markets/Societal Compass/Firepower.
 *
 * Post-ship, 2026-09-22 (explicit user request — the original always-
 * fetch-everything shape was slow): country identity (the full,
 * searchable country list) loads once on mount; relationships/trust load
 * bounded to the *current selection* and re-fetch only when that
 * selection changes (add/remove a country) — not on every render, and
 * never a full-save fetch. Player countries load automatically (the
 * default selection, `computeDefaultSelection` — the same pattern
 * Leaderboard/World Goods/Societal Compass already use); everyone else
 * loads on demand as the player adds them via `AddCountryInput`. Only
 * relationships where BOTH sides are selected are ever visible — a non-
 * selected country never appears as an arc — enforced directly in SQL
 * now (`listDiplomaticRelationsArrow`/`listRelationTrustArrow`), not as
 * a client-side filter over a full fetch.
 */
export function DiplomacyTab({ db }: DiplomacyTabProps) {
  const [countries, setCountries] = useState<DiplomacyCountry[] | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [relData, setRelData] = useState<RelationshipData | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<RelationType>>(
    () => new Set(RELATION_TYPES),
  );
  const [hugboxEnabled, setHugboxEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaderboardCountries(db).then((loaded) => {
      if (cancelled) return;
      setCountries(loaded);
      setSelectedIdxs(computeDefaultSelection(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (selectedIdxs.length === 0) {
      setRelData({ relationships: [], trust: [] });
      return;
    }
    let cancelled = false;
    Promise.all([loadDiplomaticRelations(db, selectedIdxs), loadRelationTrust(db, selectedIdxs)]).then(
      ([relationships, trust]) => {
        if (!cancelled) setRelData({ relationships, trust });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, selectedIdxs]);

  const visibleRelationships = useMemo(() => {
    if (!relData) return null;
    return filterByRelationType(relData.relationships, visibleTypes);
  }, [relData, visibleTypes]);

  const viewModel = useMemo(() => {
    if (!countries || !relData || !visibleRelationships) return null;
    return buildChordViewModel(countries, visibleRelationships, relData.trust);
  }, [countries, relData, visibleRelationships]);

  // spec FR-013/Edge Cases: computed only from the currently-visible
  // alliance relationships — toggling the Alliance filter off while
  // Hugbox Detection is on correctly yields zero clusters rather than a
  // stale grouping from before the filter changed. Post-ship, 2026-09-22
  // (explicit user request): economic_support ties count the same as
  // alliance for cluster formation/expansion — a country propping up
  // another's economy is treated as bloc-forming, same as a formal pact.
  const hugboxClusters = useMemo(() => {
    if (!hugboxEnabled || !visibleRelationships) return null;
    const alliancePairs = visibleRelationships
      .filter((r) => r.relationType === "alliance" || r.relationType === "economic_support")
      .map((r) => ({ firstNationIdx: r.firstNationIdx, secondNationIdx: r.secondNationIdx }));
    return computeHugboxClusters(alliancePairs);
  }, [hugboxEnabled, visibleRelationships]);

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) => (current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx]));
  }

  function toggleType(type: RelationType) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleHugbox() {
    setHugboxEnabled((current) => !current);
  }

  if (!countries || !viewModel) return null; // loading — no flash of an empty state before the first fetch resolves

  return (
    <div className="diplomacy-tab">
      <DiplomacyFilters
        countries={countries}
        selectedIdxs={selectedIdxs}
        onToggleCountry={toggleCountry}
        visibleTypes={visibleTypes}
        onToggleType={toggleType}
        hugboxEnabled={hugboxEnabled}
        onToggleHugbox={toggleHugbox}
      />
      {viewModel.edges.length === 0 ? (
        <EmptyState
          subject="diplomatic relationships"
          message="No active alliances, rivalries, royal marriages, guarantees, military access, food access, fleet basing rights, or economic support for the selected countries and filters."
        />
      ) : (
        <DiplomacyChordChart arcs={viewModel.arcs} edges={viewModel.edges} hugboxClusters={hugboxClusters} />
      )}
    </div>
  );
}
