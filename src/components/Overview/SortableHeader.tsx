import type { SortDirection } from "./useTableSort";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
}

/** One clickable, sortable `<th>` — shared by ArmyStatsTable and
 * NavyStatsTable (post-ship, explicit user request: every column
 * sortable in both). A real `<button>` inside the `<th>` (not a click
 * handler on the `<th>` itself) so it's keyboard-reachable and the
 * active direction is conveyed by a visible arrow glyph plus
 * `aria-sort`, not color alone (Constitution Principle VI). */
export function SortableHeader({ label, sortKey, activeKey, direction, onSort }: SortableHeaderProps) {
  const isActive = activeKey === sortKey;
  return (
    <th scope="col" aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="army-stats-table__sort-button" onClick={() => onSort(sortKey)}>
        {label}
        <span className="army-stats-table__sort-arrow" aria-hidden="true">
          {isActive ? (direction === "asc" ? " ▲" : " ▼") : ""}
        </span>
      </button>
    </th>
  );
}
