import type { Manifest } from "../../../tools/encyclopedia-scraping/types";
import "./EncyclopediaDomainNav.css";

interface EncyclopediaDomainNavProps {
  manifest: Manifest;
  activeDomainGroupId: string;
  activeCategoryId: string | null;
  onSelectDomainGroup: (domainGroupId: string) => void;
  onSelectCategory: (categoryId: string) => void;
}

/**
 * spec User Story 1/2: the five domain-group tabs, and the active
 * group's own category sub-list below them — reads entirely from
 * manifest.json (FR-006), so it's identical code for every group; User
 * Story 2 adds no new component, just more data for this one to render.
 */
export function EncyclopediaDomainNav({
  manifest,
  activeDomainGroupId,
  activeCategoryId,
  onSelectDomainGroup,
  onSelectCategory,
}: EncyclopediaDomainNavProps) {
  const activeGroup = manifest.domainGroups.find((g) => g.id === activeDomainGroupId);

  return (
    <nav className="encyclopedia-domain-nav" aria-label="Encyclopedia domain groups">
      <ul className="encyclopedia-domain-nav__groups">
        {manifest.domainGroups.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              className={
                group.id === activeDomainGroupId
                  ? "encyclopedia-domain-nav__group encyclopedia-domain-nav__group--active"
                  : "encyclopedia-domain-nav__group"
              }
              aria-current={group.id === activeDomainGroupId ? "page" : undefined}
              onClick={() => onSelectDomainGroup(group.id)}
            >
              {group.label}
            </button>
          </li>
        ))}
      </ul>
      {activeGroup && (
        <ul className="encyclopedia-domain-nav__categories">
          {activeGroup.categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                className={
                  category.id === activeCategoryId
                    ? "encyclopedia-domain-nav__category encyclopedia-domain-nav__category--active"
                    : "encyclopedia-domain-nav__category"
                }
                aria-current={category.id === activeCategoryId ? "page" : undefined}
                onClick={() => onSelectCategory(category.id)}
              >
                {category.label}
                <span className="encyclopedia-domain-nav__count">{category.entryCount}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
