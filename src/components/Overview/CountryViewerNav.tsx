import type { NationSummary } from "../../storage/queries";
import { NationSelector } from "./NationSelector";
import { SideNav } from "./SideNav";
import type { TabId } from "./tabs";
import "./CountryViewerNav.css";

interface CountryViewerNavProps {
  nations: NationSummary[];
  selectedNationIdx: number;
  onSelectNation: (idx: number) => void;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

/**
 * Country Viewer's own side column: the nation picker (scoped to this
 * section only — decision 2026-09-18, unlike the save/keep controls in
 * TopBar, which are global) stacked above the data-category list. Given
 * a shared grid area ("sidenav" in Shell.css) so the two read as one
 * "pick a nation, then a category" unit.
 */
export function CountryViewerNav({
  nations,
  selectedNationIdx,
  onSelectNation,
  activeTab,
  onSelectTab,
}: CountryViewerNavProps) {
  return (
    <div className="country-viewer-nav">
      <NationSelector nations={nations} selectedIdx={selectedNationIdx} onSelect={onSelectNation} />
      <SideNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </div>
  );
}
