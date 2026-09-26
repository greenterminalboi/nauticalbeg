import { afterEach, describe, expect, it } from "vitest";
import {
  forgetShare,
  listShares,
  parseShareIdFromPath,
  rememberShare,
} from "../../src/share/shareLinks";

const ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 30 chars

afterEach(() => localStorage.clear());

describe("shareLinks", () => {
  it("parses /s/<id> and nothing else", () => {
    expect(parseShareIdFromPath(`/s/${ID}`)).toBe(ID);
    expect(parseShareIdFromPath(`/s/${ID}/`)).toBe(ID);
    expect(parseShareIdFromPath("/s/short")).toBeNull();
    expect(parseShareIdFromPath("/")).toBeNull();
    expect(parseShareIdFromPath(`/x/${ID}`)).toBeNull();
  });

  it("remembers, lists newest first, prunes expired, and forgets", () => {
    const now = Date.now();
    const a = { id: "a", url: "u/a", expiresAt: new Date(now + 1000).toISOString(), deleteKey: "k" };
    const b = { id: "b", url: "u/b", expiresAt: new Date(now + 2000).toISOString(), deleteKey: "k" };
    const old = { id: "old", url: "u/o", expiresAt: new Date(now - 1).toISOString(), deleteKey: "k" };
    rememberShare(old);
    rememberShare(a);
    rememberShare(b);
    expect(listShares(now).map((s) => s.id)).toEqual(["b", "a"]);
    forgetShare("b");
    expect(listShares(now).map((s) => s.id)).toEqual(["a"]);
  });

  it("ignores garbage in storage", () => {
    localStorage.setItem("nauticalbeg.shares", "{not json");
    expect(listShares()).toEqual([]);
    localStorage.setItem("nauticalbeg.shares", JSON.stringify([{ id: 1 }]));
    expect(listShares()).toEqual([]);
  });
});
