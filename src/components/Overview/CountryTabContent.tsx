import type { NationSummary } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import type { TabId } from "./tabs";
import { ComingSoonPlaceholder } from "./ComingSoonPlaceholder";
import { EstatesTab } from "./EstatesTab";
import { GovernmentTab } from "./GovernmentTab";
import { HistoryTab } from "./HistoryTab";
import { LocationsTab } from "./LocationsTab";
import { MilitaryTab } from "./MilitaryTab";
import { OverviewTab } from "./OverviewTab";
import { ProvincesTab } from "./ProvincesTab";
import { SubjectsTab } from "./SubjectsTab";
import { ValuesTab } from "./ValuesTab";

export interface CountryTabContentProps {
  db: SaveDatabase;
  activeTab: TabId;
  nationIdx: number;
  /** Every selectable nation (the nation selector's list). */
  nations: NationSummary[];
  inGameDate: string;
  /** Switch the Countries view to another nation's Overview (Subjects). */
  onOpenNation: (nationIdx: number) => void;
}

const COMING_SOON_LABELS: Partial<Record<TabId, string>> = {
  economy: "Economy",
  buildings: "Building Registry",
  characters: "Characters",
};

/**
 * Factbook → Countries: renders the side-nav tab for the selected nation
 * (specs/018-country-factbook-tabs contracts/ui.md). Each tab refetches
 * its own data when `nationIdx` changes. Economy, Building Registry and
 * Characters are out of 018's scope and show the Coming Soon page.
 */
export function CountryTabContent({ db, activeTab, nationIdx, nations, inGameDate, onOpenNation }: CountryTabContentProps) {
  switch (activeTab) {
    case "overview":
      return <OverviewTab db={db} nationIdx={nationIdx} inGameDate={inGameDate} />;
    case "history":
      return <HistoryTab db={db} nationIdx={nationIdx} />;
    case "provinces":
      return <ProvincesTab db={db} nationIdx={nationIdx} />;
    case "locations":
      return <LocationsTab db={db} nationIdx={nationIdx} />;
    case "military":
      return <MilitaryTab db={db} nationIdx={nationIdx} />;
    case "government":
      return <GovernmentTab db={db} nationIdx={nationIdx} />;
    case "estates":
      return <EstatesTab db={db} nationIdx={nationIdx} />;
    case "values":
      return <ValuesTab db={db} nationIdx={nationIdx} />;
    case "subjects":
      return (
        <SubjectsTab
          db={db}
          nationIdx={nationIdx}
          nationName={nations.find((n) => n.idx === nationIdx)?.name ?? "This nation"}
          nations={nations}
          onOpenNation={onOpenNation}
        />
      );
    case "economy":
    case "buildings":
    case "characters":
      return <ComingSoonPlaceholder feature={COMING_SOON_LABELS[activeTab]!} />;
  }
}
