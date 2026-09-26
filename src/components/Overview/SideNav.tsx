import type { TabId } from "./tabs";
import "./SideNav.css";

interface SideNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "provinces", label: "Provinces" },
  { id: "locations", label: "Locations" },
  { id: "military", label: "Military" },
  { id: "government", label: "Government" },
  { id: "estates", label: "Estates" },
  { id: "values", label: "Values" },
  { id: "subjects", label: "Subjects" },
  { id: "economy", label: "Economy" },
  { id: "buildings", label: "Building Registry" },
  { id: "characters", label: "Characters" },
];

/**
 * Lists every data category within Country Viewer. AI Agent and Map are
 * NOT here — they moved to the app-level top nav (decision 2026-09-18,
 * alongside Country Viewer and Settings) since they're peers of Country
 * Viewer itself, not data categories within it. FR-015: every item is a
 * native `<button>`, keyboard-operable without extra wiring. Mobile is
 * out of scope for this project (decision 2026-09-18) — this is a
 * permanent column, no collapse behavior.
 */
export function SideNav({ activeTab, onSelectTab }: SideNavProps) {
  return (
    <nav className="side-nav" aria-label="Data categories">
      <ul className="side-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                item.id === activeTab ? "side-nav__item side-nav__item--active" : "side-nav__item"
              }
              aria-current={item.id === activeTab ? "page" : undefined}
              onClick={() => onSelectTab(item.id)}
            >
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
