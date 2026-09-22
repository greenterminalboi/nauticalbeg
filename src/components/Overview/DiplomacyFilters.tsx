import { AddCountryInput } from "./AddCountryInput";
import { RELATION_TYPE_LEGEND, RELATION_TYPES, type DiplomacyCountry, type RelationType } from "./diplomacyData";
import "./DiplomacyFilters.css";

interface DiplomacyFiltersProps {
  countries: readonly DiplomacyCountry[];
  selectedIdxs: readonly number[];
  onToggleCountry: (idx: number) => void;
  visibleTypes: ReadonlySet<RelationType>;
  onToggleType: (type: RelationType) => void;
  hugboxEnabled: boolean;
  onToggleHugbox: () => void;
}

function dashPreview(pattern: (typeof RELATION_TYPE_LEGEND)[RelationType]["dashPattern"]): string {
  if (pattern === "solid") return "solid";
  if (pattern === "dashed") return "5px, 5px";
  if (pattern === "dotted") return "2px, 3px";
  return pattern.map((n) => `${n}px`).join(", ");
}

/**
 * specs/013-diplomatic-relations-chord: relationship-type checkboxes
 * (spec FR-007) double as the fixed legend (contracts/ui.md) — each
 * swatch shows both the color and the line-dash pattern
 * (research.md §3, Constitution Principle VI: color is never the sole
 * signal). Country selection reuses the exact same `AddCountryInput`
 * control as Leaderboard/World Goods/Societal Compass (explicit user
 * request), not a bespoke major-powers ranking.
 */
export function DiplomacyFilters({
  countries,
  selectedIdxs,
  onToggleCountry,
  visibleTypes,
  onToggleType,
  hugboxEnabled,
  onToggleHugbox,
}: DiplomacyFiltersProps) {
  return (
    <div className="diplomacy-filters">
      <div className="diplomacy-filters__countries">
        <AddCountryInput
          countries={countries}
          selectedIdxs={selectedIdxs}
          onToggle={onToggleCountry}
          placeholder="Search countries…"
        />
      </div>
      <ul className="diplomacy-filters__legend" aria-label="Relationship types">
        {RELATION_TYPES.map((type) => {
          const style = RELATION_TYPE_LEGEND[type];
          return (
            <li key={type} className="diplomacy-filters__legend-item">
              <label>
                <input
                  type="checkbox"
                  checked={visibleTypes.has(type)}
                  onChange={() => onToggleType(type)}
                />
                <svg width="28" height="10" aria-hidden="true">
                  <line
                    x1="0"
                    y1="5"
                    x2="28"
                    y2="5"
                    stroke={style.color}
                    strokeWidth={3}
                    strokeDasharray={dashPreview(style.dashPattern)}
                  />
                </svg>
                {style.label}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="diplomacy-filters__hugbox">
        <input type="checkbox" checked={hugboxEnabled} onChange={onToggleHugbox} />
        Hugbox Detection
      </label>
    </div>
  );
}
