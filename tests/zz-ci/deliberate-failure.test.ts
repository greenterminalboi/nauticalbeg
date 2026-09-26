// TEMPORARY (017 T026 / 016 T027): proves a failing test blocks the deploy. Removed in the next commit.
import { expect, it } from "vitest";
it("fails on purpose", () => {
  expect(1).toBe(2);
});
