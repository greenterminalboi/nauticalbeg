import type { MapLayer } from "./mapLayers";
import "./MapSidebar.css";

interface MapSidebarProps {
  layers: MapLayer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * specs/005-map-visualization User Story 2: a collapsible panel listing
 * the available map layers (spec FR-003/FR-004). Controlled by its
 * parent (`MapTab`) — `collapsed`/`onToggleCollapsed` and
 * `activeLayerId`/`onSelectLayer` are both owned there, so the map's
 * pan/zoom (a `MapCanvas`-internal ref, untouched by either) survives a
 * collapse or a layer switch (spec FR-011, SC-002, SC-005). Mirrors
 * SideNav.tsx's native-button, `aria-current` list pattern.
 */
export function MapSidebar({
  layers,
  activeLayerId,
  onSelectLayer,
  collapsed,
  onToggleCollapsed,
}: MapSidebarProps) {
  return (
    <nav className="map-sidebar" aria-label="Map layers">
      <button
        type="button"
        className="map-sidebar__toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        {collapsed ? "Expand layers" : "Collapse layers"}
      </button>
      {!collapsed && (
        <ul className="map-sidebar__list">
          {layers.map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className={
                  layer.id === activeLayerId
                    ? "map-sidebar__item map-sidebar__item--active"
                    : "map-sidebar__item"
                }
                aria-current={layer.id === activeLayerId ? "page" : undefined}
                onClick={() => onSelectLayer(layer.id)}
              >
                {layer.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
