import "./ComingSoonPlaceholder.css";

interface ComingSoonPlaceholderProps {
  feature: string;
}

/**
 * FR-016: shown when the user selects the "AI Agent" or "Map" nav item —
 * both are clickable, not inert (Acceptance Scenario 6), and show this
 * instead of an error or blank area.
 */
export function ComingSoonPlaceholder({ feature }: ComingSoonPlaceholderProps) {
  return (
    <div className="coming-soon-placeholder" role="status">
      <p className="coming-soon-placeholder__title">{feature} — Coming Soon</p>
      <p className="coming-soon-placeholder__body">
        This feature hasn't been built yet. Check back in a future update.
      </p>
    </div>
  );
}
