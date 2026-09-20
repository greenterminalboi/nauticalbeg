import type { LeaderboardMetric } from "./leaderboardData";
// Reuses Country Viewer's `.side-nav`/`.side-nav__list`/`.side-nav__item`
// styles verbatim (SideNav.tsx's own item look) — only the grid
// placement/box treatment below is Leaderboard-specific.
import "./SideNav.css";
import "./LeaderboardSideNav.css";

export const LEADERBOARD_PAGES: { metric: LeaderboardMetric; title: string }[] = [
  { metric: "population", title: "Population" },
  { metric: "economical_base", title: "Economic Base" },
  { metric: "tax_base", title: "Tax Base" },
];

interface LeaderboardSideNavProps {
  activeMetric: LeaderboardMetric;
  onSelectMetric: (metric: LeaderboardMetric) => void;
}

/**
 * The Leaderboard's own side nav — one page per tracked metric
 * (population, economic base, tax base). Wired into the app shell's
 * `sidenav` grid area exactly like Country Viewer's `SideNav`/
 * `CountryViewerNav` (`FileLoader.tsx`'s `showLeaderboardNav`, mutually
 * exclusive with `showCountriesNav` since only one Encyclopedia sub-tab
 * is active at a time) — same visual treatment, not a page-local
 * floating panel.
 */
export function LeaderboardSideNav({ activeMetric, onSelectMetric }: LeaderboardSideNavProps) {
  return (
    <nav className="side-nav leaderboard-side-nav" aria-label="Leaderboard metrics">
      <ul className="side-nav__list">
        {LEADERBOARD_PAGES.map((item) => (
          <li key={item.metric}>
            <button
              type="button"
              className={
                item.metric === activeMetric ? "side-nav__item side-nav__item--active" : "side-nav__item"
              }
              aria-current={item.metric === activeMetric ? "page" : undefined}
              onClick={() => onSelectMetric(item.metric)}
            >
              <span>{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
