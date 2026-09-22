import { NEUTRAL_COLOR } from "./mapLayers";
import { formatRegimentBreakdownTooltip, toRomanAge, type RegimentBreakdownEntry } from "./militaryStatFormat";
import { HoverTooltip } from "./HoverTooltip";
import { SortableHeader } from "./SortableHeader";
import { useTableSort, type SortAccessor } from "./useTableSort";
import type { NavyStatSummary } from "./armyNavyStats";
import "./ArmyStatsTable.css"; // shares Army Stats' table styling verbatim

export interface NavyStatsTableRow extends NavyStatSummary {
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
}

interface NavyStatsTableProps {
  rows: readonly NavyStatsTableRow[];
}

// Post-ship, explicit user request: every column sortable.
const SORT_ACCESSORS: SortAccessor<NavyStatsTableRow>[] = [
  { key: "country", value: (r) => r.name },
  { key: "damageGiven", value: (r) => r.damageGiven },
  { key: "damageTaken", value: (r) => r.damageTaken },
  { key: "sailors", value: (r) => r.sailors },
  { key: "shipLevies", value: (r) => r.shipLevies },
  { key: "shipRegulars", value: (r) => r.shipRegulars },
  { key: "heavyShipCount", value: (r) => r.heavyShipCount },
  { key: "lightShipCount", value: (r) => r.lightShipCount },
  { key: "transportCount", value: (r) => r.transportCount },
  { key: "galleyCount", value: (r) => r.galleyCount },
  { key: "navyTradition", value: (r) => r.navyTradition },
  { key: "ageHeavies", value: (r) => r.ageHeavies },
  { key: "ageTransports", value: (r) => r.ageTransports },
  { key: "ageLights", value: (r) => r.ageLights },
  { key: "ageGalleys", value: (r) => r.ageGalleys },
];

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** specs/012-firepower-tab (post-ship, explicit user request): "decompose
 * the regiments on hover" — a per-class ship-count cell shows exactly
 * which ship types (and their real headcount) make up that count. */
function ShipCountCell({ count, breakdown }: { count: number; breakdown: readonly RegimentBreakdownEntry[] }) {
  return (
    <td className="army-stats-table__value">
      <HoverTooltip content={formatRegimentBreakdownTooltip(breakdown, "ship")} className="army-stats-table__value--hoverable">
        {count}
      </HoverTooltip>
    </td>
  );
}

/**
 * specs/012-firepower-tab: Navy Stats — one row per country with at
 * least one ship (spec FR-008, FR-012). Unlike Army Stats, no column
 * here is a computed-stat "partial total" — damage given/taken is
 * `null` (never a fabricated 0) only for a country with no war history
 * to derive it from.
 */
export function NavyStatsTable({ rows }: NavyStatsTableProps) {
  const { sortedRows, sortKey, direction, toggleSort } = useTableSort(rows, SORT_ACCESSORS);
  const headerProps = { activeKey: sortKey, direction, onSort: toggleSort };

  return (
    <div className="army-stats-table__scroll">
      <table className="army-stats-table" aria-label="Navy Stats">
        <thead>
          <tr>
            <SortableHeader label="Country" sortKey="country" {...headerProps} />
            <SortableHeader label="Damage Given" sortKey="damageGiven" {...headerProps} />
            <SortableHeader label="Damage Taken" sortKey="damageTaken" {...headerProps} />
            <SortableHeader label="Sailors" sortKey="sailors" {...headerProps} />
            <SortableHeader label="Ship Levies" sortKey="shipLevies" {...headerProps} />
            <SortableHeader label="Ship Regulars" sortKey="shipRegulars" {...headerProps} />
            <SortableHeader label="Heavy Ships" sortKey="heavyShipCount" {...headerProps} />
            <SortableHeader label="Light Ships" sortKey="lightShipCount" {...headerProps} />
            <SortableHeader label="Transports" sortKey="transportCount" {...headerProps} />
            <SortableHeader label="Galleys" sortKey="galleyCount" {...headerProps} />
            <SortableHeader label="Navy Tradition" sortKey="navyTradition" {...headerProps} />
            <SortableHeader label="Heavies" sortKey="ageHeavies" {...headerProps} />
            <SortableHeader label="Transports" sortKey="ageTransports" {...headerProps} />
            <SortableHeader label="Lights" sortKey="ageLights" {...headerProps} />
            <SortableHeader label="Galleys" sortKey="ageGalleys" {...headerProps} />
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
                <td className="army-stats-table__value">{formatNumber(row.damageGiven, 0)}</td>
                <td className="army-stats-table__value">{formatNumber(row.damageTaken, 0)}</td>
                <td className="army-stats-table__value">{formatNumber(row.sailors)}</td>
                <td className="army-stats-table__value">{formatNumber(row.shipLevies, 0)}</td>
                <td className="army-stats-table__value">{formatNumber(row.shipRegulars, 0)}</td>
                <ShipCountCell count={row.heavyShipCount} breakdown={row.heavyShipBreakdown} />
                <ShipCountCell count={row.lightShipCount} breakdown={row.lightShipBreakdown} />
                <ShipCountCell count={row.transportCount} breakdown={row.transportBreakdown} />
                <ShipCountCell count={row.galleyCount} breakdown={row.galleyBreakdown} />
                <td className="army-stats-table__value">{formatNumber(row.navyTradition)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageHeavies)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageTransports)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageLights)}</td>
                <td className="army-stats-table__value">{toRomanAge(row.ageGalleys)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
