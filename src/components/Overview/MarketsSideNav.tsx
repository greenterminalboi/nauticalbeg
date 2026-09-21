// Reuses Country Viewer's `.side-nav`/`.side-nav__list`/`.side-nav__item`
// styles verbatim (SideNav.tsx's own item look), same as LeaderboardSideNav.
import "./SideNav.css";
import "./MarketsSideNav.css";

export type MarketsView = "worldGoods" | "markets";

export const MARKETS_VIEWS: { id: MarketsView; label: string }[] = [
  { id: "worldGoods", label: "World Goods" },
  { id: "markets", label: "Markets" },
];

interface MarketsSideNavProps {
  activeView: MarketsView;
  onSelectView: (view: MarketsView) => void;
}

/**
 * specs/009-world-goods-production (post-ship follow-up, 2026-09-21):
 * Markets' own side nav — one page per view (World Goods, Markets).
 * Wired into the app shell's `sidenav` grid area exactly like
 * `LeaderboardSideNav`/`CountryViewerNav` (`FileLoader.tsx`'s
 * `showMarketsNav`, mutually exclusive with the other two since only
 * one Factbook sub-tab is active at a time) — moved out of
 * `MarketsTab.tsx`'s own top-of-content button group, which the
 * project's convention reserves for a secondary axis (e.g.
 * `LeaderboardTab.tsx`'s own graph/ranking/treemap toggle), not the
 * primary page switch.
 */
export function MarketsSideNav({ activeView, onSelectView }: MarketsSideNavProps) {
  return (
    <nav className="side-nav markets-side-nav" aria-label="Markets views">
      <ul className="side-nav__list">
        {MARKETS_VIEWS.map((item) => (
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
