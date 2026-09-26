import type { SubjectRelation } from "../../storage/queries";

export interface SubjectNode {
  idx: number;
  name: string;
  tag: string | null;
  subjectType: string | null;
  startDate: string | null;
  /** The subject can be picked in the nation selector (a live nation). */
  clickable: boolean;
  children: SubjectNode[];
}

/**
 * specs/018 research.md R7: the subjects of `rootIdx`, each with its own
 * subjects nested under it, down every level. Built from the whole
 * relation list (a couple of hundred rows on a large save). A nation seen
 * once is never expanded again, so bad data with a loop can't recurse
 * forever.
 */
export function buildSubjectTree(
  rootIdx: number,
  relations: readonly SubjectRelation[],
  selectableIdxs: ReadonlySet<number>,
): SubjectNode[] {
  const byOverlord = new Map<number, SubjectRelation[]>();
  for (const r of relations) {
    byOverlord.set(r.overlordIdx, [...(byOverlord.get(r.overlordIdx) ?? []), r]);
  }
  const visited = new Set<number>([rootIdx]);

  function childrenOf(overlordIdx: number): SubjectNode[] {
    const nodes: SubjectNode[] = [];
    for (const r of byOverlord.get(overlordIdx) ?? []) {
      if (visited.has(r.subjectIdx)) continue;
      visited.add(r.subjectIdx);
      nodes.push({
        idx: r.subjectIdx,
        name: r.subjectName ?? r.subjectTag ?? `Country ${r.subjectIdx}`,
        tag: r.subjectTag,
        subjectType: r.subjectType,
        startDate: r.startDate,
        clickable: selectableIdxs.has(r.subjectIdx),
        children: [],
      });
    }
    // Children are expanded after siblings are claimed, so a nation listed
    // under two overlords appears once, under the first.
    for (const node of nodes) node.children = childrenOf(node.idx);
    return nodes;
  }

  return childrenOf(rootIdx);
}
