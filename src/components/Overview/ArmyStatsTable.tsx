import { NEUTRAL_COLOR } from "./mapLayers";
import {
  formatBreakdownTooltip,
  formatRegimentBreakdownTooltip,
  toRomanAge,
  type PartialStat,
  type RegimentBreakdownEntry,
} from "./militaryStatFormat";
import { HoverTooltip } from "./HoverTooltip";
import { SortableHeader } from "./SortableHeader";
import { useTableSort, type SortAccessor } from "./useTableSort";
import type { ArmyStatSummary } from "./armyNavyStats";
import "./ArmyStatsTable.css";

export interface ArmyStatsTableRow extends ArmyStatSummary {
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
}

interface ArmyStatsTableProps {
  rows: readonly ArmyStatsTableRow[];
}

// Post-ship, explicit user request: every column sortable. One accessor
// per column, defined once at module scope (never recreated per render
// — useTableSort relies on that).
const SORT_ACCESSORS: SortAccessor<ArmyStatsTableRow>[] = [
  { key: "country", value: (r) => r.name },
  { key: "morale", value: (r) => r.morale },
  { key: "discipline", value: (r) => r.discipline.value },
  { key: "tactics", value: (r) => r.tactics.value },
  { key: "manpower", value: (r) => r.manpower },
  { key: "regiments", value: (r) => r.regimentCount },
  { key: "maintenance", value: (r) => r.armyMaintenanceCost },
  { key: "levy", value: (r) => r.levySize },
  { key: "regulars", value: (r) => r.regularsSize },
  { key: "fortLimit", value: (r) => r.fortLimit.value },
  { key: "siegeAbility", value: (r) => r.siegeAbility.value },
  { key: "fortDefense", value: (r) => r.fortDefense.value },
  { key: "armyTradition", value: (r) => r.armyTradition },
  { key: "artillery", value: (r) => r.ageArtillery },
  { key: "infantry", value: (r) => r.ageInfantry },
  { key: "cavalry", value: (r) => r.ageCavalry },
  { key: "supply", value: (r) => r.ageSupply },
];

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** Renders a computed-stat cell with a small "partial" marker (spec
 * FR-013) — text, not color alone (Constitution Principle VI) — and a
 * hover breakdown of exactly which sources produced the number, so
 * "why is this 0.10?" is answerable without leaving the table. */
function PartialStatCell({ stat }: { stat: PartialStat }) {
  return (
    <td className="army-stats-table__value">
      <HoverTooltip content={formatBreakdownTooltip(stat)} className="army-stats-table__value--hoverable">
        {stat.value.toFixed(2)}
        <span className="army-stats-table__partial-marker">{" "}*</span>
      </HoverTooltip>
    </td>
  );
}

/** specs/012-firepower-tab (post-ship, explicit user request): "decompose
 * the regiments on hover" — shows exactly which regiment types (and
 * their real headcount) make up the country's total. */
function RegimentCountCell({ count, breakdown }: { count: number; breakdown: readonly RegimentBreakdownEntry[] }) {
  return (
    <td className="army-stats-table__value">
      <HoverTooltip content={formatRegimentBreakdownTooltip(breakdown, "regiment")} className="army-stats-table__value--hoverable">
        {count}
      </HoverTooltip>
    </td>
  );
}

/**
 * specs/012-firepower-tab: Army Stats — one row per country with at
 * least one land regiment (spec FR-004, FR-012). discipline/tactics/
 * fort limit/siege ability/fort defense are always marked partial (†),
 * never presented as an exact total.
 */
export function ArmyStatsTable({ rows }: ArmyStatsTableProps) {
  const { sortedRows, sortKey, direction, toggleSort } = useTableSort(rows, SORT_ACCESSORS);
  const headerProps = { activeKey: sortKey, direction, onSort: toggleSort };

  return (
    <div className="army-stats-table__scroll">
      <table className="army-stats-table" aria-label="Army Stats">
        <thead>
          <tr>
            <SortableHeader label="Country" sortKey="country" {...headerProps} />
            <SortableHeader label="Morale" sortKey="morale" {...headerProps} />
            <SortableHeader label="Discipline" sortKey="discipline" {...headerProps} />
            <SortableHeader label="Tactics" sortKey="tactics" {...headerProps} />
            <SortableHeader label="Manpower" sortKey="manpower" {...headerProps} />
            <SortableHeader label="Regiments" sortKey="regiments" {...headerProps} />
            <SortableHeader label="Maintenance" sortKey="maintenance" {...headerProps} />
            <SortableHeader label="Levy Size" sortKey="levy" {...headerProps} />
            <SortableHeader label="Regulars Size" sortKey="regulars" {...headerProps} />
            <SortableHeader label="Fort Limit" sortKey="fortLimit" {...headerProps} />
            <SortableHeader label="Siege Ability" sortKey="siegeAbility" {...headerProps} />
            <SortableHeader label="Fort Defense" sortKey="fortDefense" {...headerProps} />
            <SortableHeader label="Army Tradition" sortKey="armyTradition" {...headerProps} />
            <SortableHeader label="Artillery" sortKey="artillery" {...headerProps} />
            <SortableHeader label="Infantry" sortKey="infantry" {...headerProps} />
            <SortableHeader label="Cavalry" sortKey="cavalry" {...headerProps} />
            <SortableHeader label="Supply" sortKey="supply" {...headerProps} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const [r, g, b] = row.colorRgb ?? NEUTRAL_COLOR;
            return (
              <tr key={row.nationIdx}>
                <td>
                  <span
                    className="army-stats-table__swatch"
                    style={{ background: `rgb(${r}, ${g}, ${b})` }}
                    aria-hidden="true"
                  />
                  {row.name} ({row.tag})
                </td>
                <td className="army-stats-table__value">{formatNumber(row.morale)}</td>
                <PartialStatCell stat={row.discipline} />
                <PartialStatCell stat={row.tactics} />
                <td className="army-stats-table__value">{formatNumber(row.manpower)}</td>
                <RegimentCountCell count={row.regimentCount} breakdown={row.regimentBreakdown} />
                <td className="army-stats-table__value">{formatNumber(row.armyMaintenanceCost)}</td>
                <td className="army-stats-table__value">{formatNumber(row.levySize, 0)}</td>
                <td className="army-stats-table__value">{formatNumber(row.regularsSize, 0)}</td>
                <PartialStatCell stat={row.fortLimit} />
                <PartialStatCell stat={row.siegeAbility} />
                <PartialStatCell stat={row.fortDefense} />
                <td className="army-stats-table__value">{formatNumber(row.armyTradition)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageArtillery)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageInfantry)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageCavalry)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageSupply)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="army-stats-table__footnote">
        * Partial total — excludes ruler/leader trait contributions (no character data is parsed by this app).
      </p>
    </div>
  );
}
