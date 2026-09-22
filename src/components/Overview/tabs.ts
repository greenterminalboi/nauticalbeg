/**
 * Which top-level app section is active: NauticalBot (the future AI
 * copilot, constitution Principle VIII), Atlas (the map — labeled "Map"
 * until 2026-09-20), Factbook (the per-save reference browser —
 * formerly "Country Viewer," then "Encyclopedia"; internal id renamed
 * `"factbook"` on 2026-09-20 specifically so it stops colliding with
 * the *new*, separate "Encyclopedia" section below — the two are not
 * the same thing despite the name history), Encyclopedia (new
 * 2026-09-20, currently a placeholder), or Settings. Plain component
 * state, not routing — see research.md §4. Global save/keep controls
 * stay visible across every section; only Factbook has a
 * sub-navigation, and only its "Countries" sub-tab has a nation
 * selector and category tabs.
 */
export type AppSection = "nauticalbot" | "map" | "factbook" | "encyclopedia" | "settings";

/**
 * Which sub-tab is active *within* Factbook (decision 2026-09-19,
 * section itself renamed from "Encyclopedia" to "Factbook" 2026-09-20 —
 * this type's own name is unchanged, still describes the same five
 * sub-tabs): "Countries" is exactly what the whole section used to be
 * (nation selector + category tabs, below); "Wars," "Leaderboard,"
 * "Characters," and "Markets" are sibling save-wide reference browsers
 * at the same level, not nested under Countries — each spans multiple
 * countries (or, for Characters, isn't inherently tied to a single
 * nation at all — distinct from the existing per-nation "Characters"
 * item in Countries' own side nav, which is scoped to whichever nation
 * is selected) rather than belonging to one.
 */
export type EncyclopediaTab =
  | "countries"
  | "wars"
  | "leaderboard"
  | "characters"
  | "markets"
  | "societal-compass"
  | "firepower";

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
