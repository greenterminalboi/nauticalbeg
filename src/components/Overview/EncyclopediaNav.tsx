import type { EncyclopediaTab } from "./tabs";
import "./EncyclopediaNav.css";

const TABS: { id: EncyclopediaTab; label: string }[] = [
  { id: "countries", label: "Countries" },
  { id: "wars", label: "Wars" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "characters", label: "Characters" },
  { id: "markets", label: "Markets" },
  { id: "societal-compass", label: "Societal Compass" },
  { id: "firepower", label: "Firepower" },
];

interface EncyclopediaNavProps {
  activeTab: EncyclopediaTab;
  onSelectTab: (tab: EncyclopediaTab) => void;
}

/**
 * Encyclopedia's own sub-navigation (decision 2026-09-19) — "Countries"
 * (the nation selector + category tabs, exactly what this whole section
 * used to be before the rename), "Wars," "Leaderboard," "Characters,"
 * and "Markets" (sibling save-wide reference browsers) are peers here,
 * not one nested under the other. Spans the full width, below the
 * global `TopBar` and above whichever sub-tab's own content/side-nav
 * renders.
 */
export function EncyclopediaNav({ activeTab, onSelectTab }: EncyclopediaNavProps) {
  return (
    <nav className="encyclopedia-nav" aria-label="Encyclopedia sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={
            tab.id === activeTab
              ? "encyclopedia-nav__tab encyclopedia-nav__tab--active"
              : "encyclopedia-nav__tab"
          }
          aria-current={tab.id === activeTab ? "page" : undefined}
          onClick={() => onSelectTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
