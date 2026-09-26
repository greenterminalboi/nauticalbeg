import { describe, expect, it } from "vitest";
import { buildSubjectTree } from "../../src/components/Overview/subjectTree";
import type { SubjectRelation } from "../../src/storage/queries";

function rel(overlordIdx: number, subjectIdx: number, subjectType = "vassal"): SubjectRelation {
  return {
    overlordIdx,
    subjectIdx,
    subjectTag: `T${subjectIdx}`,
    subjectName: `Nation ${subjectIdx}`,
    subjectType,
    startDate: null,
  };
}

describe("buildSubjectTree (specs/018 FR-024)", () => {
  it("nests subjects of subjects under their overlord, any depth", () => {
    const tree = buildSubjectTree(1, [rel(1, 2), rel(2, 3, "fiefdom"), rel(3, 4), rel(1, 5, "tributary"), rel(9, 10)], new Set([2, 3, 4, 5]));
    expect(tree.map((n) => n.idx)).toEqual([2, 5]);
    expect(tree[0].children.map((n) => n.idx)).toEqual([3]);
    expect(tree[0].children[0]).toMatchObject({ subjectType: "fiefdom", name: "Nation 3" });
    expect(tree[0].children[0].children.map((n) => n.idx)).toEqual([4]);
    expect(tree[1].children).toEqual([]);
  });

  it("stops at a repeat instead of looping forever on bad data", () => {
    const tree = buildSubjectTree(1, [rel(1, 2), rel(2, 3), rel(3, 1), rel(3, 2)], new Set([1, 2, 3]));
    expect(tree.map((n) => n.idx)).toEqual([2]);
    expect(tree[0].children.map((n) => n.idx)).toEqual([3]);
    expect(tree[0].children[0].children).toEqual([]);
  });

  it("marks a subject clickable only when it can be selected in the nation selector", () => {
    const [live, gone] = buildSubjectTree(1, [rel(1, 2), rel(1, 3)], new Set([2]));
    expect(live.clickable).toBe(true);
    expect(gone.clickable).toBe(false);
  });

  it("returns nothing for a nation without subjects", () => {
    expect(buildSubjectTree(7, [rel(1, 2)], new Set([2]))).toEqual([]);
  });
});
