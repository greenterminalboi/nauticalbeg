import "./EmptyState.css";

interface EmptyStateProps {
  /** What's empty, e.g. "provinces", "military units" — used in the default message. */
  subject: string;
  /** Override the default "This nation has no {subject}." wording entirely. */
  message?: string;
}

/**
 * FR-013: "this nation genuinely has none of X" — distinct from
 * NotAvailableState's "the tool couldn't read this section" (FR-014), so
 * a user is never left wondering which one they're looking at.
 */
export function EmptyState({ subject, message }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <p className="empty-state__label">Nothing to show</p>
      <p className="empty-state__message">{message ?? `This nation has no ${subject}.`}</p>
    </div>
  );
}
