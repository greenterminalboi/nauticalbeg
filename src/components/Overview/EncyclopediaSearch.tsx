import { useEffect, useState } from "react";
import type { SearchIndexRow } from "../../../tools/encyclopedia-scraping/types";
import { loadSearchIndex } from "./encyclopediaData";
import "./EncyclopediaSearch.css";

const MAX_RESULTS = 20;

interface EncyclopediaSearchProps {
  onSelectEntry: (category: string, key: string) => void;
}

/**
 * spec FR-009 / User Story 3: a single search across every domain
 * group, by display name or internal key, not scoped to whichever
 * group is currently open. The index is eagerly loaded once (it's
 * lean — no field/description data, research.md §4) so filtering is
 * instant, in-memory (spec SC-002).
 */
export function EncyclopediaSearch({ onSelectEntry }: EncyclopediaSearchProps) {
  const [index, setIndex] = useState<SearchIndexRow[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadSearchIndex().then(setIndex);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const results =
    trimmed.length === 0 || !index
      ? []
      : index
          .filter((row) => row.key.toLowerCase().includes(trimmed) || (row.name ?? "").toLowerCase().includes(trimmed))
          .slice(0, MAX_RESULTS);

  function selectRow(row: SearchIndexRow) {
    setQuery("");
    onSelectEntry(row.category, row.key);
  }

  return (
    <div className="encyclopedia-search">
      <input
        type="search"
        className="encyclopedia-search__input"
        placeholder="Search the Encyclopedia…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search the Encyclopedia"
      />
      {results.length > 0 && (
        <ul className="encyclopedia-search__results">
          {results.map((row) => (
            <li key={`${row.category}::${row.key}`}>
              <button type="button" className="encyclopedia-search__result" onClick={() => selectRow(row)}>
                <span>{row.name ?? row.key}</span>
                <span className="encyclopedia-search__result-category">{row.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
