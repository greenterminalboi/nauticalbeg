import { NEUTRAL_COLOR } from "./mapLayers";
import "./LeaderboardRankingTable.css";

export interface LeaderboardRankingEntry {
  nationIdx: number;
  label: string;
  color: [number, number, number] | null;
  /** The country's latest available value for the active metric, or
   * `null` if it has no data at all for it (e.g. formed too recently to
   * have a recorded year yet) — ranked last, not as a fabricated 0.
   * Drives rank order; `secondaryValue` never does. */
  value: number | null;
  /** Post-ship, 2026-09-21 (Ruler History, explicit user request): an
   * optional second value column shown alongside the primary ranked
   * one — e.g. Ruler History's current ruler's skill next to its
   * primary average-skill ranking. Ignored unless the table is also
   * given `secondaryTitle`. */
  secondaryValue?: number | null;
}

interface LeaderboardRankingTableProps {
  title: string;
  entries: readonly LeaderboardRankingEntry[];
  /** Post-ship, 2026-09-21: renders a second value column headed by
   * this title when provided (see `secondaryValue` above). */
  secondaryTitle?: string;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * A leaderboard: rank, country, latest value — ranked by sorting
 * descending. A country with no data (`value: null`) ranks last and
 * gets no rank number (there's nothing to rank it against). Reuses the
 * same country identity (label, in-game color) `LeaderboardChart` plots
 * with, so a row's swatch always matches its line on the graph above.
 */
export function LeaderboardRankingTable({ title, entries, secondaryTitle }: LeaderboardRankingTableProps) {
  const ranked = [...entries].sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });

  return (
    <table className="leaderboard-ranking-table" aria-label={`${title} ranking`}>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Country</th>
          <th scope="col">{title}</th>
          {secondaryTitle && <th scope="col">{secondaryTitle}</th>}
        </tr>
      </thead>
      <tbody>
        {ranked.map((entry, i) => {
          const [r, g, b] = entry.color ?? NEUTRAL_COLOR;
          return (
            <tr key={entry.nationIdx}>
              <td className="leaderboard-ranking-table__rank">
                {entry.value === null ? "—" : i + 1}
              </td>
              <td>
                <span
                  className="leaderboard-ranking-table__swatch"
                  style={{ background: `rgb(${r}, ${g}, ${b})` }}
                  aria-hidden="true"
                />
                {entry.label}
              </td>
              <td>{entry.value === null ? "—" : formatValue(entry.value)}</td>
              {secondaryTitle && (
                <td>
                  {entry.secondaryValue == null ? "—" : formatValue(entry.secondaryValue)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
