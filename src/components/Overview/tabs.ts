/**
 * Which top-level app section is active: NauticalBot (the future AI
 * copilot, constitution Principle VIII), Map, Country Viewer (the
 * per-save/per-nation data browser — everything this file used to be the
 * whole app), or Settings. Plain component state, not routing — see
 * research.md §4. Global save/keep controls stay visible across every
 * section; only Country Viewer has a nation selector and category tabs.
 */
export type AppSection = "nauticalbot" | "map" | "country-viewer" | "settings";

/**
 * Which data category is active *within* Country Viewer (plan.md's
 * Technical Context). Plain component state, not client-side routing —
 * see research.md §4. Shared between FileLoader.tsx (owns the state) and
 * SideNav.tsx (renders the selector) to avoid a circular import.
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
