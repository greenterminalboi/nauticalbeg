import { describe, expect, it } from "vitest";
import { createRng, fnv1a, stableStringify } from "../../src/battleSim/rng";

describe("battleSim rng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds", () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it("int() covers the full inclusive d10 range and nothing outside it", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 10));
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("stableStringify ignores key order, so equal objects hash equally", () => {
    expect(fnv1a(stableStringify({ a: 1, b: [2, { c: 3, d: 4 }] }))).toEqual(
      fnv1a(stableStringify({ b: [2, { d: 4, c: 3 }], a: 1 })),
    );
  });
});
