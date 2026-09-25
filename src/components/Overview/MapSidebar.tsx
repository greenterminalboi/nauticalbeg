import { useState } from "react";
import type { MapLayer, MapLayerGrain } from "./mapLayers";
import "./MapSidebar.css";

interface MapSidebarProps {
  layers: MapLayer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// specs/014-country-province-map-modes FR-018: sidebar sections, in
// display order. Within a section, layers keep MAP_LAYERS' registration
// order.
const GRAIN_SECTIONS: Array<{ grain: MapLayerGrain; title: string }> = [
  { grain: "location", title: "Location" },
  { grain: "province", title: "Province" },
  { grain: "country", title: "Country" },
];

/**
 * specs/005-map-visualization User Story 2: a collapsible panel listing
 * the available map layers (spec FR-003/FR-004). Controlled by its
 * parent (`MapTab`) — `collapsed`/`onToggleCollapsed` and
 * `activeLayerId`/`onSelectLayer` are both owned there, so the map's
 * pan/zoom (a `MapCanvas`-internal ref, untouched by either) survives a
 * collapse or a layer switch (spec FR-011, SC-002, SC-005). Mirrors
 * SideNav.tsx's native-button, `aria-current` list pattern.
 *
 * specs/014-country-province-map-modes US1: layers are grouped into
 * Location/Province/Country sections, each independently collapsible.
 * Per-section collapse is local state — it only affects this panel, never
 * the canvas — and collapsing the section holding the active layer
 * leaves that layer active (acceptance scenario 1.2).
 */
export function MapSidebar({
  layers,
  activeLayerId,
  onSelectLayer,
  collapsed,
  onToggleCollapsed,
}: MapSidebarProps) {
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<MapLayerGrain>>(new Set());

  function toggleSection(grain: MapLayerGrain) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(grain)) next.delete(grain);
      else next.add(grain);
      return next;
    });
  }

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
      {!collapsed &&
        GRAIN_SECTIONS.map(({ grain, title }) => {
          const sectionLayers = layers.filter((layer) => layer.grain === grain);
          if (sectionLayers.length === 0) return null;
          const sectionCollapsed = collapsedSections.has(grain);
          const listId = `map-sidebar-section-${grain}`;
          return (
            <section key={grain} className="map-sidebar__section">
              <button
                type="button"
                className="map-sidebar__section-toggle"
                onClick={() => toggleSection(grain)}
                aria-expanded={!sectionCollapsed}
                aria-controls={listId}
              >
                <span className="map-sidebar__section-indicator" aria-hidden="true">
                  {sectionCollapsed ? "▸" : "▾"}
                </span>
                {title}
              </button>
              {!sectionCollapsed && (
                <ul className="map-sidebar__list" id={listId}>
                  {sectionLayers.map((layer) => (
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
            </section>
          );
        })}
    </nav>
  );
}
