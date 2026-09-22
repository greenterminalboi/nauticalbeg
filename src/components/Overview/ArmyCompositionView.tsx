import { NEUTRAL_COLOR } from "./mapLayers";
import { formatModifierSource, formatUnitTypeName, toRomanAge, type PartialStat, type RegimentBreakdownEntry } from "./militaryStatFormat";
import { formatNumber } from "./ArmyStatsTable";
import { SortableHeader } from "./SortableHeader";
import { useTableSort, type SortAccessor } from "./useTableSort";
import type { ArmyStatSummary } from "./armyNavyStats";
import "./ArmyCompositionView.css";

export interface ArmyCompositionRow extends ArmyStatSummary {
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
}

interface ArmyCompositionViewProps {
  row: ArmyCompositionRow;
}

/** Same total-plus-sources a hover tooltip shows in ArmyStatsTable
 * (formatBreakdownTooltip), rendered as always-visible markup instead —
 * the whole point of this view (user request: "all that information"
 * without needing to hover). */
function StatBreakdownCard({ label, stat }: { label: string; stat: PartialStat }) {
  return (
    <div className="army-composition__stat-card">
      <div className="army-composition__stat-card-header">
        <span className="army-composition__stat-card-label">{label}</span>
        <span className="army-composition__stat-card-value">
          {stat.value.toFixed(2)}
          <span className="army-composition__partial-marker"> *</span>
        </span>
      </div>
      {stat.breakdown.length === 0 ? (
        <p className="army-composition__stat-card-empty">No matching source currently active.</p>
      ) : (
        <ul className="army-composition__stat-card-sources">
          {stat.breakdown.map((entry, i) => (
            <li key={i}>
              <span>{formatModifierSource(entry)}</span>
              <span className="army-composition__stat-card-source-value">
                {entry.value >= 0 ? "+" : ""}
                {entry.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// user request 2026-09-22 (+ "add artillery barrage as well" follow-up):
// the regiment stats already resolved into UnitTypeStats (unitTypeReference.ts's
// own doc comment) — one column per field, in the order the user listed
// them, artillery barrage appended last since it was asked for after the
// rest. 2-decimal formatting: several of these are small fractional
// modifiers (e.g. 0.05) that a 1-decimal round would flatten to 0.1 or 0.
const STAT_COLUMNS: { label: string; get: (stats: RegimentBreakdownEntry["stats"]) => number }[] = [
  { label: "Maximum Strength", get: (s) => s.maxStrength },
  { label: "Combat Power", get: (s) => s.combatPower },
  { label: "Frontage", get: (s) => s.frontage },
  { label: "Combat Speed", get: (s) => s.combatSpeed },
  { label: "Initiative", get: (s) => s.initiative },
  { label: "Flanking Ability", get: (s) => s.flankingAbility },
  { label: "Secure Flanks", get: (s) => s.secureFlanksDefense },
  { label: "Morale Damage Taken", get: (s) => s.moraleDamageTaken },
  { label: "Strength Damage Taken", get: (s) => s.strengthDamageTaken },
  { label: "Morale Damage Done", get: (s) => s.moraleDamageDone },
  { label: "Strength Damage Done", get: (s) => s.strengthDamageDone },
  { label: "Food Storage", get: (s) => s.foodStoragePerStrength },
  { label: "Food Consumption", get: (s) => s.foodConsumptionPerStrength },
  { label: "Movement Speed", get: (s) => s.movementSpeed },
  { label: "Unit Weight", get: (s) => s.unitWeight },
  { label: "Artillery Barrage", get: (s) => s.artilleryBarrage },
];

// user request 2026-09-22: sequential (deliberately a different hue
// family from CATEGORY_BADGE_COLORS below, so the two badges never read
// as the same kind of signal) — darker age reads as "later era" at a
// glance even before the roman numeral registers.
const AGE_BADGE_COLORS: Record<1 | 2 | 3 | 4 | 5 | 6, [number, number, number]> = {
  1: [96, 165, 250],
  2: [59, 130, 246],
  3: [37, 99, 235],
  4: [29, 78, 216],
  5: [30, 64, 175],
  6: [30, 58, 138],
};

// This table is army-only (computeArmyStats' own regimentBreakdown),
// so only these four display categories ever actually appear — the
// fallback exists only in case a future reference regeneration
// introduces one this map hasn't been updated for (never fabricated,
// just falls back to NEUTRAL_COLOR like every other categorical map
// layer in this codebase, e.g. mapLayers.ts's RANK_COLORS lookup).
const CATEGORY_BADGE_COLORS: Record<string, [number, number, number]> = {
  Infantry: [22, 163, 74],
  Cavalry: [180, 83, 9],
  Artillery: [220, 38, 38],
  Supply: [100, 116, 139],
};

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

const SORT_ACCESSORS: SortAccessor<RegimentBreakdownEntry>[] = [
  { key: "unitType", value: (e) => formatUnitTypeName(e.unitType) },
  { key: "status", value: (e) => (e.isLevy ? "Levy" : "Regular") },
  { key: "regiments", value: (e) => e.regimentCount },
  { key: "headcount", value: (e) => e.totalNumber },
  ...STAT_COLUMNS.map((col): SortAccessor<RegimentBreakdownEntry> => ({
    key: col.label,
    value: (e) => col.get(e.stats),
  })),
];

function RegimentCompositionTable({ breakdown }: { breakdown: readonly RegimentBreakdownEntry[] }) {
  const { sortedRows, sortKey, direction, toggleSort } = useTableSort(breakdown, SORT_ACCESSORS);
  const headerProps = { activeKey: sortKey, direction, onSort: toggleSort };

  if (breakdown.length === 0) {
    return <p>No army regiments.</p>;
  }
  return (
    <div className="army-composition__regiment-table-scroll">
      <table className="army-composition__regiment-table">
        <thead>
          <tr>
            <SortableHeader label="Unit Type" sortKey="unitType" {...headerProps} />
            <SortableHeader label="Status" sortKey="status" {...headerProps} />
            <SortableHeader label="Regiments" sortKey="regiments" {...headerProps} />
            <SortableHeader label="Headcount" sortKey="headcount" {...headerProps} />
            {STAT_COLUMNS.map((col) => (
              <SortableHeader key={col.label} label={col.label} sortKey={col.label} {...headerProps} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((entry) => (
            <tr key={entry.unitType}>
              <td>
                {formatUnitTypeName(entry.unitType)}
                <span
                  className="army-composition__badge"
                  style={{ background: rgb(AGE_BADGE_COLORS[entry.age]) }}
                  aria-label={`Age ${toRomanAge(entry.age)}`}
                >
                  {toRomanAge(entry.age)}
                </span>
                <span
                  className="army-composition__badge"
                  style={{ background: rgb(CATEGORY_BADGE_COLORS[entry.displayCategory] ?? NEUTRAL_COLOR) }}
                >
                  {entry.displayCategory}
                </span>
              </td>
              <td>{entry.isLevy ? "Levy" : "Regular"}</td>
              <td className="army-composition__regiment-table-value">{entry.regimentCount}</td>
              <td className="army-composition__regiment-table-value">{entry.totalNumber}</td>
              {STAT_COLUMNS.map((col) => (
                <td className="army-composition__regiment-table-value" key={col.label}>
                  {formatNumber(col.get(entry.stats), 2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * specs/012-firepower-tab (post-ship, explicit user request): "Army
 * Composition" — one country's full military detail, always visible,
 * rather than the same numbers only reachable by hovering a cell in
 * ArmyStatsTable. Pure presentation over an already-computed
 * ArmyStatSummary (+ display fields); FirepowerTab owns loading it for
 * whichever single country CountrySelect has picked.
 */
export function ArmyCompositionView({ row }: ArmyCompositionViewProps) {
  const [r, g, b] = row.colorRgb ?? NEUTRAL_COLOR;

  return (
    <div className="army-composition">
      <div className="army-composition__header">
        <span
          className="army-composition__swatch"
          style={{ background: `rgb(${r}, ${g}, ${b})` }}
          aria-hidden="true"
        />
        <h2 className="army-composition__title">
          {row.name} ({row.tag})
        </h2>
      </div>

      <section className="army-composition__section">
        <h3>Overview</h3>
        <dl className="army-composition__overview-grid">
          <div>
            <dt>Morale</dt>
            <dd>{formatNumber(row.morale)}</dd>
          </div>
          <div>
            <dt>Manpower</dt>
            <dd>{formatNumber(row.manpower)}</dd>
          </div>
          <div>
            <dt>Army Maintenance</dt>
            <dd>{formatNumber(row.armyMaintenanceCost)}</dd>
          </div>
          <div>
            <dt>Levy Size</dt>
            <dd>{formatNumber(row.levySize, 0)}</dd>
          </div>
          <div>
            <dt>Regulars Size</dt>
            <dd>{formatNumber(row.regularsSize, 0)}</dd>
          </div>
          <div>
            <dt>Army Tradition</dt>
            <dd>{formatNumber(row.armyTradition)}</dd>
          </div>
          <div>
            <dt>Regiments</dt>
            <dd>{row.regimentCount}</dd>
          </div>
        </dl>
      </section>

      <section className="army-composition__section">
        <h3>Doctrine &amp; Fortification</h3>
        <div className="army-composition__stat-cards">
          <StatBreakdownCard label="Discipline" stat={row.discipline} />
          <StatBreakdownCard label="Military Tactics" stat={row.tactics} />
          <StatBreakdownCard label="Fort Limit" stat={row.fortLimit} />
          <StatBreakdownCard label="Siege Ability" stat={row.siegeAbility} />
          <StatBreakdownCard label="Fort Defense" stat={row.fortDefense} />
        </div>
      </section>

      <section className="army-composition__section">
        <h3>Equipment Ages</h3>
        <dl className="army-composition__overview-grid">
          <div>
            <dt>Artillery</dt>
            <dd>{toRomanAge(row.ageArtillery)}</dd>
          </div>
          <div>
            <dt>Infantry</dt>
            <dd>{toRomanAge(row.ageInfantry)}</dd>
          </div>
          <div>
            <dt>Cavalry</dt>
            <dd>{toRomanAge(row.ageCavalry)}</dd>
          </div>
          <div>
            <dt>Supply</dt>
            <dd>{toRomanAge(row.ageSupply)}</dd>
          </div>
        </dl>
      </section>

      <section className="army-composition__section">
        <h3>Regiment Composition</h3>
        <RegimentCompositionTable breakdown={row.regimentBreakdown} />
      </section>

      <p className="army-composition__footnote">
        * Partial total — excludes ruler/leader trait contributions (no character data is parsed by this app).
      </p>
    </div>
  );
}
