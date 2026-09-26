import { NEUTRAL_COLOR } from "./mapLayers";
import { formatUnitTypeName, toRomanAge, type RegimentBreakdownEntry } from "./militaryStatFormat";
import { formatNumber } from "./ArmyStatsTable";
import { SortableHeader } from "./SortableHeader";
import { useTableSort, type SortAccessor } from "./useTableSort";
import type { NavyProfile } from "./firepowerData";
// Same layout and badges as the army view it sits beside.
import "./ArmyCompositionView.css";

const CLASS_BADGE_COLORS: Record<string, [number, number, number]> = {
  Heavies: [30, 64, 175],
  Lights: [14, 165, 233],
  Galleys: [180, 83, 9],
  Transports: [100, 116, 139],
};

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

const SORT_ACCESSORS: SortAccessor<RegimentBreakdownEntry>[] = [
  { key: "unitType", value: (e) => formatUnitTypeName(e.unitType) },
  { key: "class", value: (e) => e.displayCategory },
  { key: "status", value: (e) => (e.isLevy ? "Levy" : "Regular") },
  { key: "ships", value: (e) => e.totalNumber },
];

function ShipCompositionTable({ ships }: { ships: readonly RegimentBreakdownEntry[] }) {
  const { sortedRows, sortKey, direction, toggleSort } = useTableSort(ships, SORT_ACCESSORS);
  const headerProps = { activeKey: sortKey, direction, onSort: toggleSort };
  return (
    <div className="army-composition__regiment-table-scroll">
      <table className="army-composition__regiment-table">
        <thead>
          <tr>
            <SortableHeader label="Ship Type" sortKey="unitType" {...headerProps} />
            <SortableHeader label="Class" sortKey="class" {...headerProps} />
            <SortableHeader label="Status" sortKey="status" {...headerProps} />
            <SortableHeader label="Ships" sortKey="ships" {...headerProps} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((entry) => (
            <tr key={entry.unitType}>
              <td>
                {formatUnitTypeName(entry.unitType)}
                <span className="army-composition__badge" aria-label={`Age ${toRomanAge(entry.age)}`}>
                  {toRomanAge(entry.age)}
                </span>
              </td>
              <td>
                <span
                  className="army-composition__badge"
                  style={{ background: rgb(CLASS_BADGE_COLORS[entry.displayCategory] ?? NEUTRAL_COLOR) }}
                >
                  {entry.displayCategory}
                </span>
              </td>
              <td>{entry.isLevy ? "Levy" : "Regular"}</td>
              <td className="army-composition__regiment-table-value">{entry.totalNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * specs/018 US5: the naval counterpart of ArmyCompositionView for one
 * nation. Ship counts are the same computeNavyStats numbers Firepower's
 * Navy Stats shows; `row` is null when the nation has no ships.
 */
export function NavyCompositionView({ row }: { row: NavyProfile | null }) {
  if (!row) return <p>This nation has no ships.</p>;
  const ships = [
    ...row.heavyShipBreakdown,
    ...row.lightShipBreakdown,
    ...row.galleyBreakdown,
    ...row.transportBreakdown,
  ];

  return (
    <div className="army-composition">
      <section className="army-composition__section" aria-label="Fleet">
        <h3>Fleet</h3>
        <dl className="army-composition__overview-grid">
          <div>
            <dt>Heavy Ships</dt>
            <dd>{row.heavyShipCount}</dd>
          </div>
          <div>
            <dt>Light Ships</dt>
            <dd>{row.lightShipCount}</dd>
          </div>
          <div>
            <dt>Galleys</dt>
            <dd>{row.galleyCount}</dd>
          </div>
          <div>
            <dt>Transports</dt>
            <dd>{row.transportCount}</dd>
          </div>
          <div>
            <dt>Sailors</dt>
            <dd>{formatNumber(row.sailors)}</dd>
          </div>
          <div>
            <dt>Navy Tradition</dt>
            <dd>{formatNumber(row.navyTradition)}</dd>
          </div>
          <div>
            <dt>Damage Given</dt>
            <dd>{formatNumber(row.damageGiven)}</dd>
          </div>
          <div>
            <dt>Damage Taken</dt>
            <dd>{formatNumber(row.damageTaken)}</dd>
          </div>
        </dl>
      </section>

      <section className="army-composition__section">
        <h3>Equipment Ages</h3>
        <dl className="army-composition__overview-grid">
          <div>
            <dt>Heavies</dt>
            <dd>{toRomanAge(row.ageHeavies)}</dd>
          </div>
          <div>
            <dt>Lights</dt>
            <dd>{toRomanAge(row.ageLights)}</dd>
          </div>
          <div>
            <dt>Galleys</dt>
            <dd>{toRomanAge(row.ageGalleys)}</dd>
          </div>
          <div>
            <dt>Transports</dt>
            <dd>{toRomanAge(row.ageTransports)}</dd>
          </div>
        </dl>
      </section>

      <section className="army-composition__section">
        <h3>Ship Composition</h3>
        <ShipCompositionTable ships={ships} />
      </section>
    </div>
  );
}
