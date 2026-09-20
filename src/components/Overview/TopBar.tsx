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
  { id: "map", label: "Atlas" },
  { id: "factbook", label: "Factbook" },
  { id: "encyclopedia", label: "Encyclopedia" },
  { id: "settings", label: "Settings" },
];

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onFileSelected: (file: File) => void;
  /** null when no save is loaded yet — the keep/forget controls aren't shown at all. */
  keepState: KeepState | null;
  onKeepToggle: () => void;
  /** The currently loaded save's filename, or null/undefined when none is
   * loaded. Drives the file picker's own status text (see the doc comment
   * on `top-bar__file-picker` below) instead of relying on the native
   * `<input type="file">` label, which the onChange handler immediately
   * resets to blank so the same file can be re-selected later — left
   * alone, that native reset makes the picker always read "No file
   * chosen" even while a save is actively loaded. */
  loadedFilename?: string | null;
}

/**
 * The one piece of the shell present in every state and every section,
 * visible from the very first render (before any save is loaded). Holds
 * the app-level section nav (NauticalBot / Atlas / Factbook /
 * Encyclopedia / Settings — decision 2026-09-18, renamed 2026-09-19,
 * "Map"→"Atlas" and "Encyclopedia"→"Factbook" plus new "Encyclopedia"
 * added 2026-09-20) and the save/keep controls, which are global (a
 * loaded save stays loaded regardless of which section is active). The
 * nation selector is NOT here — it only makes sense within Factbook's
 * "Countries" sub-tab, so it lives there instead (see FileLoader.tsx).
 */
export function TopBar({
  activeSection,
  onSelectSection,
  onFileSelected,
  keepState,
  onKeepToggle,
  loadedFilename,
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
          <span className="top-bar__file-picker-label">
            {loadedFilename ? "Load a different save" : "Select an EU5 save file"}
          </span>
          <input
            type="file"
            className="top-bar__file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ""; // allow re-selecting the same file later
              if (file) onFileSelected(file);
            }}
          />
          {/* App-controlled status text, not the input's own native label
              (see loadedFilename's doc comment above) — this is what
              actually reflects whether a save is loaded. */}
          <span className="top-bar__file-status">{loadedFilename ?? "No file chosen"}</span>
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
