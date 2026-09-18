import type { NationSummary } from "../../storage/queries";
import "./NationSelector.css";

interface NationSelectorProps {
  nations: NationSummary[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

/**
 * FR-015: lets the user re-render the overview for any real nation in the
 * loaded save, not just the player's. Deliberately a thin, generic
 * "pick an idx from a list" component — the query it's backed by
 * (`getNationOverview`) and this selection pattern are meant to
 * generalize to future selectable views, not stay nation-specific.
 */
export function NationSelector({ nations, selectedIdx, onSelect }: NationSelectorProps) {
  return (
    <label className="nation-selector">
      <span className="nation-selector__label">Viewing Nation</span>
      <select
        className="nation-selector__select"
        value={selectedIdx}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {nations.map((nation) => (
          <option key={nation.idx} value={nation.idx}>
            {nation.name} ({nation.tag})
          </option>
        ))}
      </select>
    </label>
  );
}
