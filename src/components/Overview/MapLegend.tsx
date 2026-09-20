import type { LegendEntry } from "./mapLayers";
import "./MapLegend.css";

interface MapLegendProps {
  title: string;
  entries: LegendEntry[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// A CSS `columns` list can't reliably widen its own auto-sized ancestor
// to fit more than one column — an absolutely positioned panel with no
// explicit width just shrink-wraps to a single column's content and
// scrolls, no matter how much horizontal room MapLegend.css's max-width
// allows (confirmed against the real RGO layer's ~50 entries during this
// feature's implementation). Deciding the column budget here, as an
// explicit width class based on entry count, sidesteps that CSS
// intrinsic-sizing ambiguity entirely instead of fighting it.
function widthClassFor(entryCount: number): string {
  if (entryCount > 30) return "map-legend--wide-3col";
  if (entryCount > 12) return "map-legend--wide-2col";
  return "";
}

/**
 * specs/005-map-visualization FR-012: renders whatever legend entries
 * the active MapLayer supplies — no layer-specific logic here. Every
 * swatch is paired with its text label (constitution Principle VI: color
 * is never the only way to tell two entries apart). Collapsible for the
 * same reason MapSidebar is (mirrors its collapsed/onToggleCollapsed
 * pattern exactly) — both are floating overlays on top of the map now,
 * and should be able to get out of the way without losing the map's
 * pan/zoom state, which lives entirely in MapCanvas and is untouched by
 * either panel's own collapse state. Widens into extra columns instead
 * of one ever-taller column once a layer has enough entries (RGO's raw
 * goods being the motivating case) — see widthClassFor above.
 */
export function MapLegend({ title, entries, collapsed, onToggleCollapsed }: MapLegendProps) {
  const widthClass = collapsed ? "" : widthClassFor(entries.length);
  return (
    <div className={`map-legend ${widthClass}`.trim()} aria-label={`${title} legend`}>
      <button
        type="button"
        className="map-legend__toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        {collapsed ? "Expand legend" : "Collapse legend"}
      </button>
      {!collapsed && (
        <>
          <p className="map-legend__title">{title}</p>
          <ul className="map-legend__list">
            {entries.map((entry) => (
              <li key={entry.label} className="map-legend__item">
                <span
                  className="map-legend__swatch"
                  style={{ background: `rgb(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]})` }}
                  aria-hidden="true"
                />
                <span>{entry.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
