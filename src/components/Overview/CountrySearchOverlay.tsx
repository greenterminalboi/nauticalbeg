import { useState } from "react";
import type { LeaderboardCountry } from "./leaderboardData";
import "./CountrySearchOverlay.css";

interface CountrySearchOverlayProps {
  countries: LeaderboardCountry[];
  selectedIdxs: number[];
  onToggle: (idx: number) => void;
}

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

/**
 * spec User Story 2 / FR-006: a search bar over the already-loaded
 * `LeaderboardCountry[]` list (no query of its own — `LeaderboardTab`
 * loaded it once via `leaderboardData.ts`). Filters by name OR tag
 * substring, case-insensitive. Every result here is already guaranteed
 * `country_type = 'Real'` by `listLeaderboardCountriesArrow` (spec
 * FR-007) — this component adds no filter of its own for that.
 */
export function CountrySearchOverlay({ countries, selectedIdxs, onToggle }: CountrySearchOverlayProps) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const results = needle
    ? countries.filter(
        (c) =>
          countryLabel(c).toLowerCase().includes(needle) || c.tag.toLowerCase().includes(needle),
      )
    : countries;

  return (
    <div className="country-search-overlay">
      <input
        type="text"
        className="country-search-overlay__input"
        placeholder="Search countries by name or tag…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="country-search-overlay__results">
        {results.map((c) => (
          <li key={c.idx}>
            <label className="country-search-overlay__result">
              <input
                type="checkbox"
                checked={selectedIdxs.includes(c.idx)}
                onChange={() => onToggle(c.idx)}
              />
              {c.color && (
                <span
                  className="country-search-overlay__swatch"
                  style={{ background: `rgb(${c.color[0]}, ${c.color[1]}, ${c.color[2]})` }}
                  aria-hidden="true"
                />
              )}
              {countryLabel(c)}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
