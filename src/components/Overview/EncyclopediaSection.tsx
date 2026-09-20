import { useEffect, useState } from "react";
import type { EncyclopediaEntry, Manifest } from "../../../tools/encyclopedia-scraping/types";
import { loadCategory, loadManifest } from "./encyclopediaData";
import { EncyclopediaDomainNav } from "./EncyclopediaDomainNav";
import { EncyclopediaCategoryList } from "./EncyclopediaCategoryList";
import { EncyclopediaEntryView } from "./EncyclopediaEntryView";
import { EncyclopediaSearch } from "./EncyclopediaSearch";
import "./EncyclopediaSection.css";

const DEFAULT_DOMAIN_GROUP = "economy-production";

/**
 * The Encyclopedia top-level section (spec FR-001) — save-independent,
 * renders with or without a loaded save (FileLoader.tsx's unconditional
 * gate). Defaults to Economy & Production (User Story 1's proof slice),
 * and composes the domain nav, category list, and entry detail.
 */
export function EncyclopediaSection() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeDomainGroupId, setActiveDomainGroupId] = useState(DEFAULT_DOMAIN_GROUP);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<EncyclopediaEntry | null>(null);

  useEffect(() => {
    loadManifest()
      .then((loaded) => {
        setManifest(loaded);
        const defaultGroup =
          loaded.domainGroups.find((g) => g.id === DEFAULT_DOMAIN_GROUP) ?? loaded.domainGroups[0];
        if (defaultGroup) {
          setActiveDomainGroupId(defaultGroup.id);
          setActiveCategoryId(defaultGroup.categories[0]?.id ?? null);
        }
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load the Encyclopedia.");
      });
  }, []);

  useEffect(() => {
    setActiveEntry(null);
    if (!activeCategoryId || !activeEntryKey) return;
    let cancelled = false;
    loadCategory(activeCategoryId).then((entries) => {
      if (cancelled) return;
      setActiveEntry(entries.find((e) => e.key === activeEntryKey) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCategoryId, activeEntryKey]);

  function selectDomainGroup(domainGroupId: string) {
    setActiveDomainGroupId(domainGroupId);
    setActiveEntryKey(null);
    const group = manifest?.domainGroups.find((g) => g.id === domainGroupId);
    setActiveCategoryId(group?.categories[0]?.id ?? null);
  }

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    setActiveEntryKey(null);
  }

  /** Jumps straight to an entry from anywhere — search (FR-009) or a
   * cross-reference link (FR-008) — switching domain group/category as
   * needed to get there. */
  function navigateToEntry(category: string, key: string) {
    const group = manifest?.domainGroups.find((g) => g.categories.some((c) => c.id === category));
    if (group) setActiveDomainGroupId(group.id);
    setActiveCategoryId(category);
    setActiveEntryKey(key);
  }

  if (loadError) {
    return (
      <div className="encyclopedia-section encyclopedia-section__status" role="status">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="encyclopedia-section encyclopedia-section__status" role="status">
        <p>Loading Encyclopedia…</p>
      </div>
    );
  }

  return (
    <div className="encyclopedia-section">
      <EncyclopediaSearch onSelectEntry={navigateToEntry} />
      <EncyclopediaDomainNav
        manifest={manifest}
        activeDomainGroupId={activeDomainGroupId}
        activeCategoryId={activeCategoryId}
        onSelectDomainGroup={selectDomainGroup}
        onSelectCategory={selectCategory}
      />
      {activeCategoryId && (
        <div className="encyclopedia-section__content">
          <EncyclopediaCategoryList
            categoryId={activeCategoryId}
            selectedKey={activeEntryKey}
            onSelectEntry={setActiveEntryKey}
          />
          {activeEntry ? (
            <EncyclopediaEntryView entry={activeEntry} onSelectCrossRef={navigateToEntry} />
          ) : (
            <p className="encyclopedia-section__status">Select an entry to view its details.</p>
          )}
        </div>
      )}
    </div>
  );
}
