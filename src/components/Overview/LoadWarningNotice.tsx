import type { LoadWarning } from "../../parser/protocol";
import "./LoadWarningNotice.css";

/**
 * 015 FR-009: a successful load that hit fields the token table couldn't
 * name (e.g. a save from a newer game patch). Non-blocking — every tab
 * still renders — but the player is told some data may be incomplete
 * rather than it being silently dropped (constitution Principle II).
 */
export function LoadWarningNotice({
  warnings,
  onDismiss,
}: {
  warnings: LoadWarning[];
  onDismiss: () => void;
}) {
  return (
    <div className="load-warning" role="status">
      <div className="load-warning__text">
        <p className="load-warning__seal">[ loaded with warnings ]</p>
        {warnings.map((warning) => (
          <p key={warning.kind} className="load-warning__body">
            {warning.message}
          </p>
        ))}
      </div>
      <button type="button" className="load-warning__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
