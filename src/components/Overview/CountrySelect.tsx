import { useState } from "react";
import type { LeaderboardCountry } from "./leaderboardData";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./CountrySelect.css";

interface CountrySelectProps {
  countries: readonly LeaderboardCountry[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  placeholder?: string;
}

function countryLabel(country: LeaderboardCountry): string {
  return country.name ?? country.tag;
}

function colorString(rgb: [number, number, number] | null): string {
  const [r, g, b] = rgb ?? NEUTRAL_COLOR;
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * specs/012-firepower-tab (post-ship, explicit user request): Army
 * Composition's way of picking the one country its always-visible detail
 * view renders — a single-select combobox, same search-a-filtered-list
 * interaction `GoodSelect` established for World Goods' good picker, just
 * over `LeaderboardCountry` (with a color swatch, matching every other
 * country-selection control in this app) instead of plain good-name
 * strings. Deliberately its own component rather than a generalized
 * `GoodSelect`: this codebase's existing precedent (RGO/Market/Terrain
 * map layers, ArmyStatsTable/NavyStatsTable) is parallel, purpose-built
 * components over one prematurely generic abstraction.
 */
export function CountrySelect({
  countries,
  selectedIdx,
  onSelect,
  placeholder = "Search countries…",
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const results = needle
    ? countries.filter(
        (c) => countryLabel(c).toLowerCase().includes(needle) || c.tag.toLowerCase().includes(needle),
      )
    : countries;

  const selected = countries.find((c) => c.idx === selectedIdx) ?? null;

  function select(idx: number) {
    onSelect(idx);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="country-select">
      <button
        type="button"
        className="country-select__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {selected && (
          <span
            className="country-select__toggle-swatch"
            style={{ background: colorString(selected.color) }}
            aria-hidden="true"
          />
        )}
        {selected ? `${countryLabel(selected)} (${selected.tag})` : "Select a country…"}
      </button>
      {open && (
        <div className="country-select__panel">
          <input
            type="text"
            className="country-select__input"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="country-select__results">
            {results.map((c) => (
              <li key={c.idx}>
                <button
                  type="button"
                  className={
                    c.idx === selectedIdx
                      ? "country-select__result country-select__result--active"
                      : "country-select__result"
                  }
                  onClick={() => select(c.idx)}
                >
                  <span
                    className="country-select__swatch"
                    style={{ background: colorString(c.color) }}
                    aria-hidden="true"
                  />
                  {countryLabel(c)} ({c.tag})
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="country-select__empty">No matching countries.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
