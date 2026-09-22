import { NEUTRAL_COLOR } from "./mapLayers";
import { HoverTooltip } from "./HoverTooltip";
import "./HeadToHeadTable.css";

export interface HeadToHeadCountry {
  nationIdx: number;
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
}

export interface HeadToHeadRow {
  label: string;
  /** Raw numeric value backing each side's display string, used only to
   * decide which side's display gets the "larger value" emphasis — a
   * neutral "which number is bigger" cue, not a claim about which side
   * is strategically better (that varies by stat and isn't something
   * this app judges). `null` on either side means no comparison is
   * drawn for that row (never a fabricated tie). */
  aValue: number | null;
  bValue: number | null;
  aDisplay: string;
  bDisplay: string;
  aTooltip?: string;
  bTooltip?: string;
}

interface HeadToHeadTableProps {
  countryA: HeadToHeadCountry;
  countryB: HeadToHeadCountry;
  rows: readonly HeadToHeadRow[];
}

function colorString(rgb: [number, number, number] | null): string {
  const [r, g, b] = rgb ?? NEUTRAL_COLOR;
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * specs/012-firepower-tab (post-ship, explicit user request): a
 * dedicated two-column head-to-head layout for exactly two selected
 * countries, rather than reading their row across a wide many-country
 * table. The larger raw value on each row is bolded as a neutral
 * "which number is bigger" cue (Constitution Principle VI: a visible
 * weight change, not a color-only cue) — never a green/red "better/
 * worse" judgment, since that varies by stat (e.g. a higher maintenance
 * cost isn't "better") and this app doesn't make that call.
 */
export function HeadToHeadTable({ countryA, countryB, rows }: HeadToHeadTableProps) {
  return (
    <table className="head-to-head-table" aria-label={`${countryA.name} vs ${countryB.name}`}>
      <thead>
        <tr>
          <th scope="col" className="head-to-head-table__stat-header">
            Stat
          </th>
          <th scope="col">
            <span className="head-to-head-table__swatch" style={{ background: colorString(countryA.colorRgb) }} aria-hidden="true" />
            {countryA.name} ({countryA.tag})
          </th>
          <th scope="col">
            <span className="head-to-head-table__swatch" style={{ background: colorString(countryB.colorRgb) }} aria-hidden="true" />
            {countryB.name} ({countryB.tag})
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const aLarger = row.aValue !== null && row.bValue !== null && row.aValue > row.bValue;
          const bLarger = row.aValue !== null && row.bValue !== null && row.bValue > row.aValue;
          return (
            <tr key={row.label}>
              <td className="head-to-head-table__stat-label">{row.label}</td>
              <td className={aLarger ? "head-to-head-table__value head-to-head-table__value--larger" : "head-to-head-table__value"}>
                {row.aTooltip ? (
                  <HoverTooltip content={row.aTooltip} className="head-to-head-table__value--hoverable">
                    {row.aDisplay}
                  </HoverTooltip>
                ) : (
                  row.aDisplay
                )}
              </td>
              <td className={bLarger ? "head-to-head-table__value head-to-head-table__value--larger" : "head-to-head-table__value"}>
                {row.bTooltip ? (
                  <HoverTooltip content={row.bTooltip} className="head-to-head-table__value--hoverable">
                    {row.bDisplay}
                  </HoverTooltip>
                ) : (
                  row.bDisplay
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
