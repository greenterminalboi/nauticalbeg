// specs/012-firepower-tab (post-ship, explicit user request): reusable
// click-to-sort behavior for Army Stats / Navy Stats — every column
// sortable, ascending/descending toggled by re-clicking the same header.
import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortAccessor<T> {
  /** Unique key identifying this column for sort-state tracking. */
  key: string;
  /** The value to compare on — numbers sort numerically, strings sort
   * via localeCompare; `null` (a genuinely missing value, e.g. an
   * unrecorded scalar) always sorts last regardless of direction, never
   * treated as 0 or "" (Constitution Principle IV: don't fabricate an
   * ordering for absent data). */
  value: (row: T) => number | string | null;
}

export function useTableSort<T>(rows: readonly T[], accessors: readonly SortAccessor<T>[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<SortDirection>("asc");

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const accessor = accessors.find((a) => a.key === sortKey);
    if (!accessor) return rows;
    const withValue = rows.map((row) => ({ row, value: accessor.value(row) }));
    withValue.sort((a, b) => {
      if (a.value === null && b.value === null) return 0;
      if (a.value === null) return 1; // nulls always last
      if (b.value === null) return -1;
      const cmp =
        typeof a.value === "string" && typeof b.value === "string"
          ? a.value.localeCompare(b.value)
          : a.value < b.value
            ? -1
            : a.value > b.value
              ? 1
              : 0;
      return direction === "asc" ? cmp : -cmp;
    });
    return withValue.map((w) => w.row);
    // `accessors` deliberately excluded: every caller defines it as a
    // stable module-scope literal array, never a new array per render.
  }, [rows, sortKey, direction]);

  return { sortedRows, sortKey, direction, toggleSort };
}
