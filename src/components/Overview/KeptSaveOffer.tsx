import type { KeptSaveSummary } from "../../storage/queries";
import "./KeptSaveOffer.css";

interface KeptSaveOfferProps {
  summary: KeptSaveSummary;
  onResume: () => void;
  onDismiss: () => void;
}

/**
 * FR-011/Acceptance Scenario 2: offers to resume a kept save on
 * startup rather than requiring an immediate re-upload. Dismissing this
 * does NOT forget the kept save — that's a separate, explicit action
 * (FR-013, via `KeepSaveToggle` once a save is loaded) — it just lets
 * the user load a different file instead.
 */
export function KeptSaveOffer({ summary, onResume, onDismiss }: KeptSaveOfferProps) {
  return (
    <div className="kept-save-offer">
      <p className="kept-save-offer__eyebrow">Kept Save Found</p>
      <p className="kept-save-offer__detail">
        {summary.filename}
        {summary.inGameDate ? ` — ${summary.inGameDate}` : ""}
      </p>
      <div className="kept-save-offer__actions">
        <button type="button" className="kept-save-offer__resume" onClick={onResume}>
          Resume This Save
        </button>
        <button type="button" className="kept-save-offer__dismiss" onClick={onDismiss}>
          Load a Different Save
        </button>
      </div>
    </div>
  );
}
