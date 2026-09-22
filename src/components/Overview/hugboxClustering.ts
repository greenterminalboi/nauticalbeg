// specs/013-diplomatic-relations-chord (research.md §7, data-model.md's
// HugboxCluster shape, spec User Story 4): a pure computation over the
// currently-visible alliance-only relationship pairs — no SQL, no new
// table, never persisted. Colocated beside DiplomacyChordChart.tsx like
// this app's other layout-helper modules (militaryDoctrineLayout.ts,
// compassPosition.ts).

export interface HugboxRelationshipPair {
  firstNationIdx: number;
  secondNationIdx: number;
}

export interface HugboxCluster {
  clusterId: number;
  /** A fully-mutual alliance core of 3+ countries (spec Assumptions). */
  coreNationIdxs: number[];
  /** Core plus every country promoted by 2+ alliance ties into this
   * cluster (spec FR-014) — always a superset of `coreNationIdxs`. */
  fullMemberNationIdxs: number[];
  /** Countries with exactly 1 alliance tie into this cluster — near,
   * not enclosed (spec FR-014/FR-015). */
  affiliateNationIdxs: number[];
}

function buildAdjacency(pairs: readonly HugboxRelationshipPair[]): {
  adjacency: Map<number, Set<number>>;
  allNodes: Set<number>;
} {
  const adjacency = new Map<number, Set<number>>();
  const allNodes = new Set<number>();
  for (const { firstNationIdx, secondNationIdx } of pairs) {
    allNodes.add(firstNationIdx);
    allNodes.add(secondNationIdx);
    if (!adjacency.has(firstNationIdx)) adjacency.set(firstNationIdx, new Set());
    if (!adjacency.has(secondNationIdx)) adjacency.set(secondNationIdx, new Set());
    adjacency.get(firstNationIdx)!.add(secondNationIdx);
    adjacency.get(secondNationIdx)!.add(firstNationIdx);
  }
  return { adjacency, allNodes };
}

/** Bron–Kerbosch (no pivoting — this app's alliance subgraphs are at
 * most a few dozen nodes, well within reach of the naive version)
 * finds every maximal clique. Filtering to size >= 3 happens by the
 * caller, not here, so this stays a general "find maximal cliques"
 * primitive. */
function findMaximalCliques(allNodes: ReadonlySet<number>, adjacency: Map<number, Set<number>>): number[][] {
  const cliques: number[][] = [];
  function expand(R: Set<number>, P: Set<number>, X: Set<number>): void {
    if (P.size === 0 && X.size === 0) {
      if (R.size > 0) cliques.push(Array.from(R));
      return;
    }
    for (const v of Array.from(P)) {
      const neighbors = adjacency.get(v) ?? new Set<number>();
      const nextR = new Set(R);
      nextR.add(v);
      expand(
        nextR,
        new Set(Array.from(P).filter((u) => neighbors.has(u))),
        new Set(Array.from(X).filter((u) => neighbors.has(u))),
      );
      P.delete(v);
      X.add(v);
    }
  }
  expand(new Set(), new Set(allNodes), new Set());
  return cliques;
}

/** spec User Story 4 / FR-013-FR-018: alliance-clique cores (3+
 * mutually-allied countries) plus 1-tie-affiliate/2-tie-full-member
 * expansion, with a deterministic tie-break when a country is eligible
 * for full membership in more than one cluster. `pairs` should already
 * be filtered to `relation_type === "alliance"` and to the currently-
 * visible countries/filters — this function has no opinion on that. */
export function computeHugboxClusters(pairs: readonly HugboxRelationshipPair[]): HugboxCluster[] {
  const { adjacency, allNodes } = buildAdjacency(pairs);
  const rawCliques = findMaximalCliques(allNodes, adjacency).filter((c) => c.length >= 3);

  // Greedy largest-first, non-overlapping core assignment: overlapping
  // maximal cliques aren't addressed by the spec's own worked example
  // (which only ever describes one core) — the biggest clique wins any
  // contested membership, a common, simple community-detection tie-
  // break that keeps cluster boundaries disjoint and drawable.
  rawCliques.sort((a, b) => b.length - a.length || Math.min(...a) - Math.min(...b));
  const claimed = new Set<number>();
  const cores: number[][] = [];
  for (const clique of rawCliques) {
    if (clique.some((idx) => claimed.has(idx))) continue;
    cores.push(clique);
    for (const idx of clique) claimed.add(idx);
  }

  const clusters: HugboxCluster[] = cores.map((core, clusterId) => {
    const coreSet = new Set(core);
    const fullMembers = new Set(core);
    const affiliates: number[] = [];
    // Promotion is evaluated against the original core only, one pass —
    // matching the spec's worked example exactly (D promotes by ties
    // into A/B/C, not into whichever other countries already promoted
    // in the same pass), and avoiding fixed-point/ordering ambiguity.
    for (const idx of allNodes) {
      if (coreSet.has(idx)) continue;
      const neighbors = adjacency.get(idx) ?? new Set<number>();
      let ties = 0;
      for (const member of coreSet) if (neighbors.has(member)) ties++;
      if (ties >= 2) fullMembers.add(idx);
      else if (ties === 1) affiliates.push(idx);
    }
    return {
      clusterId,
      coreNationIdxs: core,
      fullMemberNationIdxs: Array.from(fullMembers),
      affiliateNationIdxs: affiliates,
    };
  });

  resolveMultiClusterMembership(clusters, adjacency);
  return clusters;
}

/** spec FR-018/Assumptions: a country eligible for full membership in
 * 2+ clusters is assigned to exactly one — most alliance ties into that
 * cluster's core, then the larger core, then lowest nationIdx (a stable
 * proxy for "lowest tag alphabetically" at this pure-graph layer, which
 * has no country-tag data — display ordering by tag, if wanted, is the
 * caller's job, not membership). Demotes the loser to affiliate in every
 * other cluster it still has exactly one tie into, or drops it there
 * entirely. Mutates `clusters` in place. */
function resolveMultiClusterMembership(clusters: HugboxCluster[], adjacency: Map<number, Set<number>>): void {
  const claimCounts = new Map<number, number>();
  for (const cluster of clusters) {
    for (const idx of cluster.fullMemberNationIdxs) {
      if (cluster.coreNationIdxs.includes(idx)) continue; // core membership is never contested
      claimCounts.set(idx, (claimCounts.get(idx) ?? 0) + 1);
    }
  }

  for (const [idx, count] of claimCounts) {
    if (count <= 1) continue;
    let winner: HugboxCluster | null = null;
    let winnerTies = -1;
    for (const cluster of clusters) {
      if (cluster.coreNationIdxs.includes(idx) || !cluster.fullMemberNationIdxs.includes(idx)) continue;
      const neighbors = adjacency.get(idx) ?? new Set<number>();
      const ties = cluster.coreNationIdxs.filter((m) => neighbors.has(m)).length;
      const better =
        !winner ||
        ties > winnerTies ||
        (ties === winnerTies && cluster.coreNationIdxs.length > winner.coreNationIdxs.length) ||
        (ties === winnerTies &&
          cluster.coreNationIdxs.length === winner.coreNationIdxs.length &&
          Math.min(...cluster.coreNationIdxs) < Math.min(...winner.coreNationIdxs));
      if (better) {
        winner = cluster;
        winnerTies = ties;
      }
    }
    for (const cluster of clusters) {
      if (cluster === winner || !cluster.fullMemberNationIdxs.includes(idx)) continue;
      cluster.fullMemberNationIdxs = cluster.fullMemberNationIdxs.filter((i) => i !== idx);
      const neighbors = adjacency.get(idx) ?? new Set<number>();
      const hasTie = cluster.coreNationIdxs.some((m) => neighbors.has(m));
      if (hasTie) cluster.affiliateNationIdxs.push(idx);
    }
  }
}
