import { describe, expect, it } from "vitest";
import { computeHugboxClusters } from "../../src/components/Overview/hugboxClustering";

function pair(firstNationIdx: number, secondNationIdx: number) {
  return { firstNationIdx, secondNationIdx };
}

describe("computeHugboxClusters (specs/013-diplomatic-relations-chord, spec User Story 4)", () => {
  it("forms one cluster from three mutually-allied countries, all as full/core members", () => {
    // A-B, B-C, A-C: a complete triangle.
    const clusters = computeHugboxClusters([pair(1, 2), pair(2, 3), pair(1, 3)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].coreNationIdxs.sort()).toEqual([1, 2, 3]);
    expect(clusters[0].fullMemberNationIdxs.sort()).toEqual([1, 2, 3]);
    expect(clusters[0].affiliateNationIdxs).toEqual([]);
  });

  it("treats a country allied to exactly one core member as an affiliate, not a full member", () => {
    const clusters = computeHugboxClusters([
      pair(1, 2),
      pair(2, 3),
      pair(1, 3),
      pair(4, 1), // country 4 allied only to country 1
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].fullMemberNationIdxs).not.toContain(4);
    expect(clusters[0].affiliateNationIdxs).toEqual([4]);
  });

  it("promotes a country to full member once it has 2+ alliance ties into the core", () => {
    const clusters = computeHugboxClusters([
      pair(1, 2),
      pair(2, 3),
      pair(1, 3),
      pair(4, 1),
      pair(4, 2), // country 4 now allied to two of the three core members
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].fullMemberNationIdxs.sort()).toEqual([1, 2, 3, 4]);
    expect(clusters[0].affiliateNationIdxs).toEqual([]);
  });

  it("does not treat a single mutually-allied pair (no third member) as a cluster", () => {
    const clusters = computeHugboxClusters([pair(1, 2)]);
    expect(clusters).toEqual([]);
  });

  it("assigns a country eligible for full membership in two clusters to exactly one, never both", () => {
    // Cluster A: 1-2-3 triangle. Cluster B: 4-5-6-7 (a 4-country clique,
    // larger core). Country 8 has 2 ties into cluster A (1,2) and 2
    // ties into cluster B (4,5) -- eligible for full membership in both;
    // the larger core (B) must win per the tie-break rule.
    const clusters = computeHugboxClusters([
      pair(1, 2),
      pair(2, 3),
      pair(1, 3),
      pair(4, 5),
      pair(5, 6),
      pair(4, 6),
      pair(4, 7),
      pair(5, 7),
      pair(6, 7),
      pair(8, 1),
      pair(8, 2),
      pair(8, 4),
      pair(8, 5),
    ]);
    expect(clusters).toHaveLength(2);
    const clusterA = clusters.find((c) => c.coreNationIdxs.includes(1))!;
    const clusterB = clusters.find((c) => c.coreNationIdxs.includes(4))!;
    expect(clusterB.coreNationIdxs).toHaveLength(4);
    expect(clusterB.fullMemberNationIdxs).toContain(8);
    expect(clusterA.fullMemberNationIdxs).not.toContain(8);
    // Country 8 still has 2 real ties into cluster A, so it demotes to
    // an affiliate there rather than disappearing outright.
    expect(clusterA.affiliateNationIdxs).toContain(8);
  });
});
