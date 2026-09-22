// specs/012-firepower-tab: mirrors MarketsSideNav's pattern exactly —
// reuses Country Viewer's `.side-nav` styles verbatim.
import "./SideNav.css";

export type FirepowerView = "doctrine" | "army" | "navy";

export const FIREPOWER_VIEWS: { id: FirepowerView; label: string }[] = [
  { id: "doctrine", label: "Military Doctrine" },
  { id: "army", label: "Army Stats" },
  { id: "navy", label: "Navy Stats" },
];

interface FirepowerSideNavProps {
  activeView: FirepowerView;
  onSelectView: (view: FirepowerView) => void;
}

export function FirepowerSideNav({ activeView, onSelectView }: FirepowerSideNavProps) {
  return (
    <nav className="side-nav firepower-side-nav" aria-label="Firepower views">
      <ul className="side-nav__list">
        {FIREPOWER_VIEWS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                item.id === activeView ? "side-nav__item side-nav__item--active" : "side-nav__item"
              }
              aria-current={item.id === activeView ? "page" : undefined}
              onClick={() => onSelectView(item.id)}
            >
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
