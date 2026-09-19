import type { NationSummary } from "../../storage/queries";
import "./NationSelector.css";

interface NationSelectorProps {
  nations: NationSummary[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  disabled?: boolean;
}

/**
 * FR-015: lets the user re-render the overview for any real nation in the
 * loaded save, not just the player's. Deliberately a thin, generic
 * "pick an idx from a list" component — the query it's backed by
 * (`getNationOverview`) and this selection pattern are meant to
 * generalize to future selectable views, not stay nation-specific.
 *
 * FR-020: an independent top-bar control that stays visible but disabled
 * (native `disabled` attribute, so assistive tech announces it correctly
 * per constitution Principle VI) until a save is loaded, rather than
 * being hidden or merged into the save/keep controls.
 */
export function NationSelector({ nations, selectedIdx, onSelect, disabled = false }: NationSelectorProps) {
  return (
    <label className="nation-selector">
      <span className="nation-selector__label">Viewing Nation</span>
      <select
        className="nation-selector__select"
        value={selectedIdx ?? ""}
        disabled={disabled || nations.length === 0}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {nations.length === 0 && (
          <option value="" disabled>
            No save loaded
          </option>
        )}
        {nations.map((nation) => (
          <option key={nation.idx} value={nation.idx}>
            {nation.name} ({nation.tag})
          </option>
        ))}
      </select>
    </label>
  );
}
