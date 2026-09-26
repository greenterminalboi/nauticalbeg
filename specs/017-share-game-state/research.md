# Research: Share Game State by Link (017)

Findings from planning on 2026-09-25. Each entry gives the decision, the evidence, and the alternatives.

## R1. What a snapshot is, and how big (measured)

A shared game is the per-save DuckDB database, not the save file: every tab reads only from that database. It was measured on the real `MP_RUS_1657_01_03_….eu5` (85MB compressed binary, multiplayer, 1657). The save was parsed with the real pipeline in Node (59s), and every table was exported as Arrow IPC streams.

| | Size |
|---|---|
| All tables except `raw_sections`, Arrow IPC | **181.0MB** |
| … gzip level 6 | 50.8MB (5.8s) |
| … gzip level 9 | 50.6MB (17.2s) |
| … **Brotli quality 5** | **13.0MB (1.8s native)** |
| … Brotli quality 6 | 12.8MB (2.3s) |
| … Brotli quality 4 | 16.3MB (0.9s) |
| … zstd level 3 / 6 | 18.1MB / 15.3MB |
| Brotli decompress (q5) | 0.3s |
| `raw_sections` alone, excluded (FR-003) | 79MB raw, 9.3MB gzipped |

Where the size comes from: `nation_relation_trust` has **4,581,584 rows (106MB IPC, 35MB gzipped)**. That's every nation-pair trust and opinion value. 4,577,161 rows are non-zero, and 2,468 of 2,471 nations are "Real", so there's nothing safe to trim. Next are `population` (29MB), `nation_history` (25MB) and `nation_advances` (8.5MB).

**Decision**: a snapshot is every displayed table as Arrow IPC, in one container (R4), compressed with **Brotli quality 5**. Expect about 13MB for this very large late-game multiplayer save; typical saves will be smaller. gzip is 4× larger because its 32KB window can't see the repetition across rows that Brotli's large window does.

## R2. Parquet is not an option (found in testing)

The obvious "export a DuckDB database" format is Parquet. In this DuckDB-Wasm build (1.32.0), `duckdb_extensions()` reports `parquet` and `json` as **not installed and not loaded**. `COPY … (FORMAT PARQUET)` crashed Node's bindings with `null function or function signature mismatch`. In the browser it would try to download the extension from `extensions.duckdb.org` at runtime. That would be a new third-party request, and it may not load under our `require-corp` isolation header.

Arrow is what the app already uses to move data in and out of DuckDB. `insertArrowTable` has been the bulk-insert path since the 650MB-save crash fix. It needs no extension and no network. **Decision**: use Arrow IPC.

## R3. Compression in the browser

`CompressionStream` only offers gzip/deflate everywhere (50.8MB here). **Decision**:
- **Sharer**: compress with `brotli-wasm` (npm 3.0.1, Apache-2.0, by httptoolkit) at quality 5, in a dedicated Worker so the UI never blocks (constitution V). Its streaming API feeds progress. The WASM is self-hosted by Vite: well under 25 MiB, no CDN.
- **Viewer**: nothing to add. The stored object is served with `Content-Encoding: br`, so the browser decompresses it natively. Brotli content-encoding works in every evergreen browser; zstd doesn't in Safari, which rules it out despite similar numbers.
- The server stores and serves opaque bytes. It never decompresses, which also keeps it within the 10ms CPU limit (R5).

**To prove in the first spike task**, because these only behave for real in a browser or on Cloudflare:
- brotli-wasm runs under our isolation headers
- a Pages Function can return a stored object with `Content-Encoding: br` untouched (Workers' `encodeBody: "manual"`)
- Arrow → `INSERT … BY NAME` import works in DuckDB-Wasm

## R4. Snapshot container and version compatibility (FR-013)

One object per share: `brotli(container)`.

`container` = `"NBSNAP"` magic, a u16 format version, a u32 manifest length, the manifest as UTF-8 JSON, then each table's Arrow IPC stream in manifest order.

The manifest holds:
- format version
- app version (`__APP_VERSION__`)
- created-at time
- the in-game date and player nation, for the loading screen
- per table: name, row count, byte length and column names

**Import** inserts each table into the viewer's fresh database through a temporary Arrow table plus `INSERT INTO t BY NAME SELECT * FROM tmp`. So a snapshot from an older app version still imports after purely *additive* schema changes: new columns come out NULL and new tables empty. That also avoids the known `insertRows` full-column gotcha.

A snapshot fails with the "made with a different version" message if it has:
- an unknown format version
- a table or column the current schema doesn't have

Nothing is guessed (constitution III).

**What's excluded (FR-003)**: `raw_sections` is never exported, and `save_meta.filename` is replaced with `"Shared game"`. Multiplayer player names are kept, per the owner's decision, and the confirmation dialog says so.

## R5. Backend: Pages Functions + R2 + KV, same origin

**Decision**: Cloudflare **Pages Functions** in `functions/api/shares/…`, deployed with the site by the existing 016 pipeline. Being same-origin with the app means:
- no CORS
- no cross-origin isolation or COEP problems
- no second domain

Bindings are declared in a committed `wrangler.toml` (`pages_build_output_dir = "dist"`), with separate **production and preview** buckets and namespaces, so PR previews never touch real shares.

Checked limits (Cloudflare docs, 2026-09-25):

| Limit (free) | Value | Our use |
|---|---|---|
| Workers/Functions requests | 100,000/day | 1 upload + a few reads per share |
| CPU per request | 10ms | upload is streamed to R2; nothing is parsed or decompressed server-side |
| Request body | 100MB | size cap 40MB (R7) |
| Memory | 128MB | body streamed, never buffered |
| R2 storage | 10GB-month | see R8 |
| R2 Class A / B ops | 1M / 10M a month | 1–2 writes per share; 1 read per view |
| R2 egress | free | |
| KV | 100k reads, 1,000 writes a day | 2 writes per share (R6) |

- **R2 requires the owner to complete R2's (free) subscription checkout in the dashboard**, which asks for a payment method even for the free tier. This is an owner task.
- **Alternatives**:
  - A standalone Worker on `*.workers.dev`: cross-origin, needs CORS, and adds a second deployable.
  - Presigned direct-to-R2 uploads: adds S3 credentials and CORS for no gain at 13MB.

## R6. Rate limiting and the free-tier guard (FR-016, FR-020)

Cloudflare's Rate Limiting binding is documented for Workers only, with 10s/60s windows, and its free-plan status isn't stated. **Decision**: use a KV namespace instead.
- **Per visitor**: a key `rl:<hash>:<hour>` with a one-hour TTL, allowing **5 shares per hour**. `<hash>` is SHA-256 of `CF-Connecting-IP` plus a secret salt (a Pages secret), truncated. The raw IP is never stored (FR-018). KV is eventually consistent, so the count is approximate, which is acceptable here.
- **Global budget**: a key `bytes:<UTC date>`, the total compressed bytes accepted today. Shares are refused once today's total would pass **1.3GB**. With 7-day retention that caps live storage at about 9.1GB, under R2's 10GB free tier (FR-020, SC-007), whatever the snapshot sizes are.
- If KV's 1,000 writes/day are used up, shares fail closed with "sharing is busy, try later" (≤ 500 shares/day, which is fine for a beta).

## R7. Limits, IDs, expiry, deletion

- **Size cap: 40MB compressed**, checked in the browser before upload and again by the Function from `Content-Length`. That's 3× headroom over the largest real save we've measured (13MB).
- **ID**: 16 random bytes plus a 6-byte creation timestamp, base64url (about 30 characters). It's unguessable: 128 bits of randomness (FR-007). The timestamp lets a missing object be reported as "expired" (older than 7 days) or "not found" (FR-011), even after the lifecycle rule has deleted it.
- **Link**: `https://nauticalbeg.pages.dev/s/<id>`. Pages falls back to `index.html` for unknown paths when there's no `404.html`. The app reads `location.pathname`. This fallback is to be verified in the spike.
- **Expiry (FR-014)**: the Function returns **410 Gone** once `now - created ≥ 7 days`, exactly, from the object's `customMetadata.createdAt`. An **R2 lifecycle rule (`Expiration.Days = 7`)** removes the data within 24 hours after that. A test-only shorter expiry uses an env var in the preview environment only.
- **Deletion (FR-017)**: at upload the Function generates a 256-bit delete key and stores only its SHA-256 in the object's metadata. It returns the key once. The sharer's browser keeps it in `localStorage` (keyed by share ID). `DELETE /api/shares/<id>` with `Authorization: Bearer <key>` removes the object and writes a tiny `tombstones/<id>` object (also expired by the lifecycle rule), so the link shows "deleted" rather than "not found".
- **Re-share (FR-006)**: always a new ID and object. Nothing is ever updated in place.

## R8. Cost check (SC-007)

- **Storage**: live storage is capped at about 9.1GB by R6's byte budget. At 13MB per share that's about 100 shares a day, or ~3,000 a month. Typical smaller saves allow more. Under 10GB → $0.
- **Operations**: 1 PUT plus 2 KV writes per share, and 1 R2 GET per view. Nowhere near the free allowances.
- **Egress**: free.

**Result**: $0 at beta traffic. At 1,000 shares a month this uses about a third of the free storage.

## R9. Where export and import run

- **Export**: the app's main-thread read connection (`FileLoader`'s `readDbRef`) already holds the database's only OPFS handle, so export queries go through it. DuckDB-Wasm runs its queries in its own worker, so this doesn't block the UI. The data is streamed table by table to a new **share Worker** (brotli-wasm). The upload uses `XMLHttpRequest` because `upload.onprogress` is the only reliable upload-progress signal in every browser.
- **Import**: a new `importSnapshot` path in the existing parser Worker, the same shape as `loadSave`:
  - download with progress (the Function sends `X-Uncompressed-Length`)
  - decode the container
  - create a fresh database, apply the schema, insert each table by name
  - finish with the usual `ready` message

  Everything downstream (tabs, map, keep) is unchanged.

## R3 spike and browser results (2026-09-25)

The research estimate assumed native Brotli numbers. **brotli-wasm (a Rust port) compresses worse at the same level**: on the real 181MB export, q5 gives 20.9MB, q7 20.0MB, q8 20.0MB and **q9 12.5MB (11.5s in Node, 37s in Chrome on a machine at load average ~12)**. Quality 9 is used. In the browser:
- sharing took 42s end to end, giving a 13.08MB object
- opening took 23s, after fixing the import's per-batch overhead (see the tasks.md implementation notes)

