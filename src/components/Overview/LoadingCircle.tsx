import "./LoadingCircle.css";

interface LoadingCircleProps {
  /**
   * Overall progress, 0-100, or null for a fully indeterminate state
   * (no phase breakdown at all — currently only "resuming a kept save",
   * which reports no progress events). Never a fabricated number: see
   * `computeLoadingPercent` in FileLoader.tsx for how this is derived
   * only from real, known milestones (a phase having actually been
   * reached, plus real byte-read progress within "validating").
   */
  percent: number | null;
  /** Whether the current phase itself has no real sub-progress of its
   * own (true for every phase except "validating" mid-way through a
   * real byte count) — adds a gentle pulse so a percentage that's
   * genuinely holding steady for a while (e.g. "parsing" a large save)
   * still reads as active rather than stuck. */
  pulsing: boolean;
  label: string;
}

const RADIUS = 130;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Decision 2026-09-19: a single, large, centered circular progress
 * indicator shown for every in-progress load (parsing a new save,
 * resuming a kept one) regardless of which app section/tab is active —
 * previously only the Countries tab showed any loading feedback at all,
 * so switching to Wars (or any other tab) mid-load looked like nothing
 * was happening. See FileLoader.tsx for where this replaces per-tab
 * content during a load.
 */
export function LoadingCircle({ percent, pulsing, label }: LoadingCircleProps) {
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, Math.round(percent)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="loading-circle" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-circle__ring-wrapper">
        <svg
          className={
            percent === null ? "loading-circle__ring loading-circle__ring--spin" : "loading-circle__ring"
          }
          viewBox="0 0 280 280"
        >
          <circle className="loading-circle__track" cx="140" cy="140" r={RADIUS} />
          {percent !== null && (
            <circle
              className={
                pulsing
                  ? "loading-circle__progress loading-circle__progress--pulsing"
                  : "loading-circle__progress"
              }
              cx="140"
              cy="140"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          )}
          {percent === null && (
            <circle
              className="loading-circle__progress loading-circle__progress--indeterminate"
              cx="140"
              cy="140"
              r={RADIUS}
              strokeDasharray={`${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE * 0.75}`}
            />
          )}
        </svg>
        <div className="loading-circle__center">
          {percent !== null && <span className="loading-circle__percent">{clamped}%</span>}
        </div>
      </div>
      <p className="loading-circle__label">{label}</p>
    </div>
  );
}
