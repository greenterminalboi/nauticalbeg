// @vitest-environment node
import { describe, expect, it } from "vitest";
import { downloadShare, ShareDownloadError } from "../../src/parser/download-share";

function fakeFetch(res: Response): typeof fetch {
  return (async () => res) as unknown as typeof fetch;
}

async function kindFor(res: Response) {
  try {
    await downloadShare("id", () => {}, new AbortController().signal, fakeFetch(res));
    return null;
  } catch (e) {
    return e instanceof ShareDownloadError ? e.kind : "other";
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("downloadShare", () => {
  it("returns the body and expiry, reporting progress up to 100", async () => {
    const seen: (number | null)[] = [];
    const res = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "X-Uncompressed-Length": "3", "X-Expires-At": "2026-10-02T00:00:00.000Z" },
    });
    const out = await downloadShare("id", (p) => seen.push(p), new AbortController().signal, fakeFetch(res));
    expect([...out.container]).toEqual([1, 2, 3]);
    expect(out.expiresAt).toBe("2026-10-02T00:00:00.000Z");
    expect(seen.at(-1)).toBe(100);
  });

  it("maps each API error to its own message kind (FR-011)", async () => {
    expect(await kindFor(json(410, { error: "expired" }))).toBe("share-expired");
    expect(await kindFor(json(410, { error: "deleted" }))).toBe("share-deleted");
    expect(await kindFor(json(404, { error: "not_found" }))).toBe("share-not-found");
    expect(await kindFor(json(500, { error: "unavailable" }))).toBe("share-unavailable");
    expect(await kindFor(new Response("<html>", { status: 502 }))).toBe("share-unavailable");
  });

  it("reports a network failure as unavailable", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(downloadShare("id", () => {}, new AbortController().signal, failing)).rejects.toMatchObject({
      kind: "share-unavailable",
    });
  });
});
