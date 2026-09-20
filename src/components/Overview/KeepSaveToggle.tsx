import "./KeepSaveToggle.css";

interface KeepSaveToggleProps {
  kept: boolean;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
}

/**
 * FR-011/FR-013: lets the user keep the currently loaded save across
 * sessions, or forget a previously kept one. A single toggle rather than
 * separate keep/forget props since only one action is ever valid at a
 * time (mirrors `kept`).
 */
export function KeepSaveToggle({ kept, pending, error, onToggle }: KeepSaveToggleProps) {
  return (
    <div className="keep-save-toggle">
      <button
        type="button"
        className={
          kept
            ? "keep-save-toggle__button keep-save-toggle__button--forget"
            : "keep-save-toggle__button keep-save-toggle__button--keep"
        }
        onClick={onToggle}
        disabled={pending}
      >
        {pending ? (kept ? "Forgetting…" : "Keeping…") : kept ? "Forget This Save" : "Keep This Save"}
      </button>
      {/* Always mounted (visibility toggled, not conditionally rendered)
          so its width is reserved even while hidden — otherwise the
          toggle's own width changes when this appears/disappears,
          reflowing the rest of the top bar around it. */}
      <span
        className={
          kept && !pending
            ? "keep-save-toggle__status"
            : "keep-save-toggle__status keep-save-toggle__status--hidden"
        }
        aria-hidden={kept && !pending ? undefined : true}
      >
        [ kept ]
      </span>
      {error && (
        <p className="keep-save-toggle__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
