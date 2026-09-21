import { useRef, useState } from "react";
import type { LeaderboardCountry } from "./leaderboardData";
import "./AddCountryInput.css";

interface AddCountryInputProps {
  countries: readonly LeaderboardCountry[];
  selectedIdxs: readonly number[];
  onToggle: (idx: number) => void;
  /** Defaults to "Add country…" (its original World Goods wording).
   * Post-ship, 2026-09-21 (explicit user request): this became the
   * standard country-selection control across every Leaderboard chart
   * (`LeaderboardTab`, `RulerHistoryChart`) too — those pass "Search
   * countries…" since they both add and remove through it, not just
   * add. */
  placeholder?: string;
}

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

/**
 * Post-ship, 2026-09-21 (explicit user request): `WorldGoodsPage`'s way
 * of adding a country to the treemap on demand. Earlier version reused
 * `CountrySearchOverlay` behind a "Search countries" toggle button (an
 * expand/collapse box); replaced here with a plain always-visible
 * search input (placeholder "Add country…") that opens its own results
 * list on focus, no separate toggle needed — the input itself is the
 * control. Same filter-by-name-or-tag and toggle-to-add/remove behavior
 * as `CountrySearchOverlay`, but the list stays open across multiple
 * picks (adding several countries in a row shouldn't need re-opening
 * anything), closing only once focus leaves the whole control.
 */
export function AddCountryInput({
  countries,
  selectedIdxs,
  onToggle,
  placeholder = "Add country…",
}: AddCountryInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const results = needle
    ? countries.filter(
        (c) => countryLabel(c).toLowerCase().includes(needle) || c.tag.toLowerCase().includes(needle),
      )
    : countries;

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="add-country-input" ref={containerRef} onBlur={handleBlur}>
      <input
        type="text"
        className="add-country-input__input"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        // onMouseDown preventDefault: without it, clicking a checkbox
        // shifts focus to it *before* its onChange fires, which blurs
        // the input first and closes this list out from under the
        // click — the standard combobox trick to keep focus (and this
        // list) put through a pick, so adding several countries in a
        // row doesn't mean re-opening the list each time.
        <ul className="add-country-input__results" onMouseDown={(e) => e.preventDefault()}>
          {results.map((c) => (
            <li key={c.idx}>
              <label className="add-country-input__result">
                <input
                  type="checkbox"
                  checked={selectedIdxs.includes(c.idx)}
                  onChange={() => onToggle(c.idx)}
                />
                {c.color && (
                  <span
                    className="add-country-input__swatch"
                    style={{ background: `rgb(${c.color[0]}, ${c.color[1]}, ${c.color[2]})` }}
                    aria-hidden="true"
                  />
                )}
                {countryLabel(c)}
              </label>
            </li>
          ))}
          {results.length === 0 && (
            <li className="add-country-input__empty">No matching countries.</li>
          )}
        </ul>
      )}
    </div>
  );
}
