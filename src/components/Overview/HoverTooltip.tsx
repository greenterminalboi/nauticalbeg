import { useState, type ReactNode } from "react";
import "./HoverTooltip.css";

interface HoverTooltipProps {
  /** Multi-line plain text (rendered with `white-space: pre-line`, same
   * content shape the old native `title` attributes carried). */
  content: string;
  children: ReactNode;
  className?: string;
}

/**
 * specs/012-firepower-tab (post-ship, user report: "hover isn't showing
 * anything"): replaces the native `title` attribute this feature
 * originally used for stat breakdowns and doctrine-axis modifiers.
 * Native tooltips have a real, user-visible delay (~1-1.5s in most
 * browsers) before appearing and are easy to miss on a quick hover over
 * a dense table — this shows instantly on `mouseenter`. Positioned
 * `fixed` from the trigger's own bounding rect so it escapes any
 * ancestor's `overflow: auto` (the stat tables scroll horizontally)
 * rather than being clipped.
 */
export function HoverTooltip({ content, children, className }: HoverTooltipProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function handleEnter(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: rect.left });
  }

  return (
    <span
      className={className ? `hover-tooltip-trigger ${className}` : "hover-tooltip-trigger"}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPosition(null)}
    >
      {children}
      {position && (
        <div className="hover-tooltip" style={{ top: position.top, left: position.left }} role="tooltip">
          {content}
        </div>
      )}
    </span>
  );
}
