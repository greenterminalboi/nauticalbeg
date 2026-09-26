import { useEffect, useMemo, useState } from "react";
import { listSubjectRelations, type NationSummary, type SubjectRelation } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { subjectTypeName } from "./countryNames";
import { buildSubjectTree, type SubjectNode } from "./subjectTree";
import "./SubjectsTab.css";

interface SubjectsTabProps {
  db: SaveDatabase;
  nationIdx: number;
  nationName: string;
  /** The nation selector's list: only these subjects can be opened. */
  nations: NationSummary[];
  onOpenNation: (nationIdx: number) => void;
}

const RELOAD_HINT = "Not in this save's data — reload the save file";

// The game's subject colors (main_menu/common/named_colors/02_map.txt,
// subject_* entries; the two imperial free city ones converted from hsv).
const SUBJECT_TYPE_COLORS: Record<string, [number, number, number]> = {
  vassal: [51, 204, 204],
  fiefdom: [204, 153, 255],
  appanage: [0, 153, 255],
  colonial_nation: [77, 203, 161],
  conquistador: [255, 102, 102],
  dominion: [153, 51, 0],
  hanseatic_member: [138, 56, 64],
  imperial_free_city: [81, 230, 44],
  direct_imperial_free_city: [44, 230, 230],
  march: [114, 115, 43],
  samanta: [255, 153, 51],
  maha_samanta: [255, 122, 51],
  pradhana_maha_samanta: [255, 130, 47],
  state_bank: [89, 24, 154],
  trade_company: [148, 90, 206],
  tributary: [255, 204, 0],
  tusi: [255, 160, 0],
  pronoia: [135, 50, 160],
};

function countSubjects(nodes: readonly SubjectNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countSubjects(node.children), 0);
}

function SubjectList({ nodes, onOpenNation }: { nodes: readonly SubjectNode[]; onOpenNation: (idx: number) => void }) {
  return (
    <ul className="subjects-tab__list">
      {nodes.map((node) => {
        const type = node.subjectType ? subjectTypeName(node.subjectType) : "Subject";
        const [r, g, b] = (node.subjectType && SUBJECT_TYPE_COLORS[node.subjectType]) || [116, 119, 126];
        const label = (
          <>
            <span className="subjects-tab__name">{node.name}</span>
            <span className="subjects-tab__type">
              <span className="subjects-tab__dot" style={{ background: `rgb(${r}, ${g}, ${b})` }} aria-hidden="true" />
              {type}
            </span>
          </>
        );
        return (
          <li key={node.idx} className="subjects-tab__node">
            <div className="subjects-tab__row">
              {node.clickable ? (
                <button type="button" className="subjects-tab__open" onClick={() => onOpenNation(node.idx)}>
                  {label}
                </button>
              ) : (
                <span className="subjects-tab__static">{label}</span>
              )}
              {node.startDate && <span className="subjects-tab__since">since {node.startDate}</span>}
              {node.children.length > 0 && (
                <span className="subjects-tab__since">
                  {countSubjects(node.children)} {countSubjects(node.children) === 1 ? "subject" : "subjects"}
                </span>
              )}
            </div>
            {node.children.length > 0 && <SubjectList nodes={node.children} onOpenNation={onOpenNation} />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Factbook → Countries → Subjects (specs/018 US9): every subject of the
 * selected nation, with subjects of subjects nested under them, from the
 * save's diplomacy `dependency` entries. Clicking a subject switches the
 * Countries view to that nation's Overview. A subject that isn't in the
 * nation selector (e.g. no longer a live nation) is listed but can't be
 * opened.
 */
export function SubjectsTab({ db, nationIdx, nationName, nations, onOpenNation }: SubjectsTabProps) {
  const [data, setData] = useState<{ available: boolean; rows: SubjectRelation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSubjectRelations(db)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load subjects.");
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const tree = useMemo(
    () => (data ? buildSubjectTree(nationIdx, data.rows, new Set(nations.map((n) => n.idx))) : []),
    [data, nationIdx, nations],
  );

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading subjects…</p>;
  if (!data.available) return <p className="subjects-tab__hint">{RELOAD_HINT}</p>;
  if (tree.length === 0) return <p className="subjects-tab__hint">{nationName} has no subjects.</p>;

  return (
    <section className="subjects-tab" aria-labelledby="subjects-heading">
      <div className="subjects-tab__heading">
        <h2 id="subjects-heading">Subjects of {nationName}</h2>
        <span className="subjects-tab__count">{countSubjects(tree)} in total</span>
      </div>
      <SubjectList nodes={tree} onOpenNation={onOpenNation} />
    </section>
  );
}
