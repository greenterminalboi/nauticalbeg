import "./NotAvailableState.css";

interface NotAvailableStateProps {
  /** What section couldn't be read, e.g. "military data" — used in the default message. */
  subject: string;
  /** Override the default "...isn't available for this save." wording entirely. */
  message?: string;
}

/**
 * FR-014: "the tool couldn't parse this section for this save" — distinct
 * from EmptyState's "this nation genuinely has none of X" (FR-013), so a
 * user is never left wondering which one they're looking at.
 */
export function NotAvailableState({ subject, message }: NotAvailableStateProps) {
  return (
    <div className="not-available-state" role="status">
      <p className="not-available-state__label">Not available for this save</p>
      <p className="not-available-state__message">
        {message ?? `This save's ${subject} could not be read.`}
      </p>
    </div>
  );
}
