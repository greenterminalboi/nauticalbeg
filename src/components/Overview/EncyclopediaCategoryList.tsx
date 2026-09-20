import { useEffect, useMemo, useState } from "react";
import type { EncyclopediaEntry } from "../../../tools/encyclopedia-scraping/types";
import { loadCategory } from "./encyclopediaData";
import { EncyclopediaSourceBadge } from "./EncyclopediaSourceBadge";
import "./EncyclopediaCategoryList.css";

const PAGE_SIZE = 50;

interface EncyclopediaCategoryListProps {
  categoryId: string;
  selectedKey: string | null;
  onSelectEntry: (key: string) => void;
}

/**
 * One category's entries — name-with-raw-key fallback (FR-004), paged
 * rather than rendering every row at once for the largest categories
 * (Constitution Principle V; `missions`/`building_types` run into the
 * hundreds of entries in a real generated catalog).
 */
export function EncyclopediaCategoryList({ categoryId, selectedKey, onSelectEntry }: EncyclopediaCategoryListProps) {
  const [entries, setEntries] = useState<EncyclopediaEntry[] | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setPage(0);
    loadCategory(categoryId).then((loaded) => {
      if (!cancelled) setEntries(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const pageCount = entries ? Math.max(1, Math.ceil(entries.length / PAGE_SIZE)) : 1;
  const pageEntries = useMemo(() => {
    if (!entries) return [];
    return entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  }, [entries, page]);

  if (entries === null) {
    return <p className="encyclopedia-category-list__status">Loading…</p>;
  }

  if (entries.length === 0) {
    return <p className="encyclopedia-category-list__status">This category has no entries.</p>;
  }

  return (
    <div className="encyclopedia-category-list">
      <ul className="encyclopedia-category-list__items">
        {pageEntries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              className={
                entry.key === selectedKey
                  ? "encyclopedia-category-list__item encyclopedia-category-list__item--active"
                  : "encyclopedia-category-list__item"
              }
              aria-current={entry.key === selectedKey ? "page" : undefined}
              onClick={() => onSelectEntry(entry.key)}
            >
              <span>{entry.name ?? entry.key}</span>
              <EncyclopediaSourceBadge source={entry.source} />
            </button>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="encyclopedia-category-list__pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
