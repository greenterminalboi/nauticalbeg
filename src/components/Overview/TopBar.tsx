import type { AppSection } from "./tabs";
import { KeepSaveToggle } from "./KeepSaveToggle";
import "./TopBar.css";

interface KeepState {
  kept: boolean;
  pending: boolean;
  error: string | null;
}

const SECTIONS: { id: AppSection; label: string }[] = [
  { id: "nauticalbot", label: "NauticalBot" },
  { id: "map", label: "Map" },
  { id: "country-viewer", label: "Country Viewer" },
  { id: "settings", label: "Settings" },
];

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onFileSelected: (file: File) => void;
  /** null when no save is loaded yet — the keep/forget controls aren't shown at all. */
  keepState: KeepState | null;
  onKeepToggle: () => void;
}

/**
 * The one piece of the shell present in every state and every section,
 * visible from the very first render (before any save is loaded). Holds
 * the app-level section nav (NauticalBot / Map / Country Viewer /
 * Settings — decision 2026-09-18) and the save/keep controls, which are
 * global (a loaded save stays loaded regardless of which section is
 * active). The nation selector is NOT here — it only makes sense within
 * Country Viewer, so it lives there instead (see FileLoader.tsx).
 */
export function TopBar({
  activeSection,
  onSelectSection,
  onFileSelected,
  keepState,
  onKeepToggle,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <nav className="top-bar__sections" aria-label="App sections">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={
              section.id === activeSection
                ? "top-bar__section top-bar__section--active"
                : "top-bar__section"
            }
            aria-current={section.id === activeSection ? "page" : undefined}
            onClick={() => onSelectSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div className="top-bar__save-controls">
        <label className="top-bar__file-picker">
          Select an EU5 save file
          <input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ""; // allow re-selecting the same file later
              if (file) onFileSelected(file);
            }}
          />
        </label>
        {keepState && (
          <KeepSaveToggle
            kept={keepState.kept}
            pending={keepState.pending}
            error={keepState.error}
            onToggle={onKeepToggle}
          />
        )}
      </div>
    </header>
  );
}
