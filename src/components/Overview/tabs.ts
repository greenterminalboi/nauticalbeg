/**
 * Which top-level app section is active: NauticalBot (the future AI
 * copilot, constitution Principle VIII), Map, Encyclopedia (the
 * per-save reference browser — formerly "Country Viewer," renamed and
 * given its own sub-navigation, decision 2026-09-19, since it now
 * covers more than just per-nation data), or Settings. Plain component
 * state, not routing — see research.md §4. Global save/keep controls
 * stay visible across every section; only Encyclopedia has a
 * sub-navigation, and only its "Countries" sub-tab has a nation
 * selector and category tabs.
 */
export type AppSection = "nauticalbot" | "map" | "encyclopedia" | "settings";

/**
 * Which sub-tab is active *within* Encyclopedia (decision 2026-09-19):
 * "Countries" is exactly what the whole Encyclopedia section used to be
 * (nation selector + category tabs, below); "Wars," "Leaderboard,"
 * "Characters," and "Markets" are sibling save-wide reference browsers
 * at the same level, not nested under Countries — each spans multiple
 * countries (or, for Characters, isn't inherently tied to a single
 * nation at all — distinct from the existing per-nation "Characters"
 * item in Countries' own side nav, which is scoped to whichever nation
 * is selected) rather than belonging to one.
 */
export type EncyclopediaTab = "countries" | "wars" | "leaderboard" | "characters" | "markets";

/**
 * Which data category is active *within* Encyclopedia's "Countries"
 * sub-tab (plan.md's Technical Context). Plain component state, not
 * client-side routing — see research.md §4. Shared between
 * FileLoader.tsx (owns the state) and SideNav.tsx (renders the
 * selector) to avoid a circular import.
 */
export type TabId =
  | "overview"
  | "provinces"
  | "military"
  | "government"
  | "economy"
  | "diplomacy"
  | "trade"
  | "buildings"
  | "characters";
