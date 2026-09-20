import type { CrossReference, EncyclopediaEntry, EntryFieldValue } from "../../../tools/encyclopedia-scraping/types";
import { EncyclopediaSourceBadge } from "./EncyclopediaSourceBadge";
import "./EncyclopediaEntryView.css";

interface EncyclopediaEntryViewProps {
  entry: EncyclopediaEntry;
  onSelectCrossRef?: (category: string, key: string) => void;
}

function formatFieldValue(value: EntryFieldValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return JSON.stringify(value);
}

// simplified: a cross-reference is only rendered as a link (or an
// "unresolved" note) when it's on a top-level field — a reference
// nested inside a field's own object/array (e.g.
// `unique_production_methods.irrigation_maintenance.category`) still
// resolves correctly in the data (FR-008), it just isn't surfaced as a
// clickable link here, since that field's whole value already renders
// as one JSON blob. Widen this if a real entry's most useful references
// turn out to live at that depth.
function topLevelCrossRefs(entry: EncyclopediaEntry): Map<string, CrossReference> {
  const map = new Map<string, CrossReference>();
  for (const ref of entry.crossRefs) {
    const topField = ref.field.split(".")[0];
    if (!ref.field.includes(".")) map.set(topField, ref);
  }
  return map;
}

/**
 * One entry's name, description, and recorded fields exactly as parsed
 * (FR-005) — no fabricated content: a missing name/description shows
 * the raw key or nothing at all, never an invented value (FR-004).
 * Cross-references on top-level fields render as working links when
 * resolved, or a plain "references excluded content" note when not
 * (FR-008) — never a broken link.
 */
export function EncyclopediaEntryView({ entry, onSelectCrossRef }: EncyclopediaEntryViewProps) {
  const crossRefs = topLevelCrossRefs(entry);

  return (
    <article className="encyclopedia-entry-view">
      <header className="encyclopedia-entry-view__header">
        <h2>{entry.name ?? entry.key}</h2>
        <EncyclopediaSourceBadge source={entry.source} />
      </header>
      {entry.name && <p className="encyclopedia-entry-view__key">{entry.key}</p>}
      {entry.description && <p className="encyclopedia-entry-view__description">{entry.description}</p>}
      <table className="encyclopedia-entry-view__fields">
        <tbody>
          {Object.entries(entry.fields).map(([field, value]) => {
            const ref = crossRefs.get(field);
            return (
              <tr key={field}>
                <th scope="row">{field}</th>
                <td>
                  {ref?.resolved && onSelectCrossRef ? (
                    <button
                      type="button"
                      className="encyclopedia-entry-view__ref-link"
                      onClick={() => onSelectCrossRef(ref.targetCategory, ref.targetKey)}
                    >
                      {formatFieldValue(value)}
                    </button>
                  ) : (
                    <>
                      {formatFieldValue(value)}
                      {ref && !ref.resolved && (
                        <span className="encyclopedia-entry-view__ref-hint"> (references excluded content)</span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
