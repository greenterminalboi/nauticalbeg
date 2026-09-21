import type { LeaderboardPage } from "./leaderboardData";
// Reuses Country Viewer's `.side-nav`/`.side-nav__list`/`.side-nav__item`
// styles verbatim (SideNav.tsx's own item look) — only the grid
// placement/box treatment below is Leaderboard-specific.
import "./SideNav.css";
import "./LeaderboardSideNav.css";

export const LEADERBOARD_PAGES: { page: LeaderboardPage; title: string }[] = [
  { page: "population", title: "Population" },
  { page: "economical_base", title: "Economic Base" },
  { page: "tax_base", title: "Tax Base" },
  // Post-ship, 2026-09-21: Ruler History is a page like the three
  // above, but a fundamentally different data shape (ruler_history, not
  // nation_history) — LeaderboardTab.tsx branches on this one value.
  { page: "ruler_history", title: "Ruler History" },
];

interface LeaderboardSideNavProps {
  activePage: LeaderboardPage;
  onSelectPage: (page: LeaderboardPage) => void;
}

/**
 * The Leaderboard's own side nav — one entry per page (the three
 * `nation_history` metrics, plus Ruler History). Wired into the app
 * shell's `sidenav` grid area exactly like Country Viewer's `SideNav`/
 * `CountryViewerNav` (`FileLoader.tsx`'s `showLeaderboardNav`, mutually
 * exclusive with `showCountriesNav` since only one Encyclopedia sub-tab
 * is active at a time) — same visual treatment, not a page-local
 * floating panel.
 */
export function LeaderboardSideNav({ activePage, onSelectPage }: LeaderboardSideNavProps) {
  return (
    <nav className="side-nav leaderboard-side-nav" aria-label="Leaderboard metrics">
      <ul className="side-nav__list">
        {LEADERBOARD_PAGES.map((item) => (
          <li key={item.page}>
            <button
              type="button"
              className={
                item.page === activePage ? "side-nav__item side-nav__item--active" : "side-nav__item"
              }
              aria-current={item.page === activePage ? "page" : undefined}
              onClick={() => onSelectPage(item.page)}
            >
              <span>{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
