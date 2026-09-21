import { useState } from "react";
import "./GoodSelect.css";

interface GoodSelectProps {
  /** Every selectable good's name — already scoped by the caller to
   * whatever it wants offered (World Goods only offers goods with a
   * production-share breakdown, i.e. RGOs). This component does no
   * filtering of its own beyond the search box. */
  goods: readonly string[];
  selectedGood: string;
  onSelectGood: (good: string) => void;
}

/**
 * specs/009-world-goods-production, post-ship 2026-09-21: replaces the
 * old `WorldGoodsOverview` data grid as the way to pick a good — a
 * single-select combobox, same search-a-filtered-list interaction
 * `CountrySearchOverlay` already established for Leaderboard, but
 * single-select instead of a checkbox multi-select, and closing itself
 * on a pick rather than staying open.
 */
export function GoodSelect({ goods, selectedGood, onSelectGood }: GoodSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const results = needle ? goods.filter((g) => g.toLowerCase().includes(needle)) : goods;

  function select(good: string) {
    onSelectGood(good);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="good-select">
      <button
        type="button"
        className="good-select__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {selectedGood}
      </button>
      {open && (
        <div className="good-select__panel">
          <input
            type="text"
            className="good-select__input"
            placeholder="Search RGOs by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="good-select__results">
            {results.map((good) => (
              <li key={good}>
                <button
                  type="button"
                  className={
                    good === selectedGood
                      ? "good-select__result good-select__result--active"
                      : "good-select__result"
                  }
                  onClick={() => select(good)}
                >
                  {good}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="good-select__empty">No matching goods.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
