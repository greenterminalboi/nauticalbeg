---

description: "Task list for Share Game State by Link"
---

# Tasks: Share Game State by Link

**Input**: Design documents from `/specs/017-share-game-state/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/shares-api.md, contracts/snapshot-format.md, contracts/share-ui.md, quickstart.md

**Implementation notes (2026-09-25)**:
- **Status**: code, tests and docs are done, and the feature was verified end to end against `wrangler pages dev` (local Functions plus simulated R2/KV) in Chrome with the real `MP_RUS_1657` save. **Blocked on the owner**: T004 (Cloudflare R2/KV/secret setup and the KV IDs in `wrangler.toml`). Until then **don't push**: the deploy step would fail on the placeholder KV IDs. T026 (preview deploy tests) and T031 (production check) follow once T004 is done.
- **T005 spike, local results**:
  - brotli-wasm runs in a Worker under our isolation headers (`crossOriginIsolated` true)
  - `/s/<id>` falls back to the app (200, `index.html`)
  - `INSERT … BY NAME` from Arrow works in DuckDB-Wasm
  - `Content-Encoding: br` from the Function arrives decompressed in the local runtime

  **Still to confirm on real Cloudflare (T026)**: that the edge passes `encodeBody: "manual"` bytes through untouched.
- **Compression: measured, and changed from the plan.** `brotli-wasm` is a Rust port and compresses much less than Node's native Brotli at the same level. On the real 181MB export:

  | brotli-wasm level | Size | Time |
  |---|---|---|
  | q5 | 20.9MB | 5.9s |
  | q7 | 20.0MB | 6.8s |
  | q8 | 20.0MB | 7.4s |
  | **q9** | **12.5MB** | **11.5s (Node)** |

  Native q5 was 13.0MB. **Quality 9 was chosen**, which halves storage and free-tier use. In Chrome on this heavily loaded machine (load average ~12), a q9 share took **42s total**: export 3.4s, compression 37s, upload 1.6s. That's within SC-001's 1 minute but close; on an idle machine expect roughly 15s. The fallback if needed is q7 (20MB, ~6s).
- **Import: fixed during the browser check.** DuckDB exports Arrow in ~2k-row record batches, and inserting each through a scratch table made the 4.6M-row trust table take minutes. `insertArrowIPC` now groups batches into ~100k-row chunks and inserts directly when the columns match exactly; the scratch + `BY NAME` path is used only for older snapshots. **Result: the viewer opened the shared game in 23s, against about 5 minutes to parse the save (SC-002).**
- **Verified locally**:
  - the confirm dialog text and expiry
  - the stored object is 13,080,853 bytes, with no `raw_sections` and no file name (decoded and checked, SC-005)
  - a viewer's Overview is identical to the sharer's (Russia, 1657.1.3, treasury 6,383.6, stability 21.3, development 6,104.8, 288 provinces), and the Atlas map renders
  - the label reads "Shared game · expires Oct 2, 2026"; Share is hidden for a shared game
  - a wrong delete key gets 403; the right key gets 204, and the link then shows "taken down"; a mistyped ID shows "not found"
- **Also added**:
  - a "Your shared links" list in the dialog (US4)
  - `.wrangler/` in `.gitignore`
  - `db.ts`'s Arrow test seam now carries `tableFromIPC` and `Table`
- **T004 done by the owner (2026-09-26)**: KV IDs `SHARE_LIMITS` = 3857be37c08c425081f601b086916f5f and `SHARE_LIMITS_PREVIEW` = 61aa9cc66a2343fab4fae78315725871 are in `wrangler.toml`.
- **T026 on PR #1's preview (`https://337d0162.nauticalbeg.pages.dev`, run 36234525418, 2026-09-26)**:
  - `check` and `deploy` passed, and the bot posted the preview comment. **This also closes 016's deferred T031.**
  - **Real Cloudflare passes the stored Brotli bytes through untouched**: `content-encoding: br`, content-length 300,792 (the stored size), and `curl --compressed` returned bytes identical to the original. That was the one assumption only production could confirm.
  - `/s/<id>` fallback: 200 text/html.
  - Rate limit on real KV: shares 1–5 got 201; the 6th got 429 `rate_limited` with `Retry-After: 2743`.
  - Expiry (preview TTL 120s): a link created at 10:14:01 returned 410 `expired` at 10:17:33, and again after the data was deleted (via the ID timestamp).
  - The owner tried the preview in the browser and reported "it works!".
  - Failure path (run 36235364230, commit c66f4c2, a deliberately failing test): `check` failed at Tests, `deploy` was **skipped**, and the preview comment stayed on the last good build. **This closes 016's deferred T027.** The test was removed and the preview TTL restored to 604800 in the next commit.
- **Found in passing, not fixed**: `tests/fixtures/rus-1628-minimal.eu5` has no player nation, so the *app* shows "No player nation found" if you load it in the browser. Unit tests are unaffected. It's a fixture limitation, noted for later.

**Tests**: Included where the design depends on them:
- Constitution II/III: a snapshot codec fixture round-trip and strict decode errors
- The API contract: status-code table tests with mocked R2/KV
- SC-003's "zero differences": an export↔import equality test

UI is verified in a real browser per quickstart.md.

**Organization**: by user story from spec.md:
- US1 (P1): share
- US2 (P1): open
- US3 (P1): expiry and abuse limits
- US4 (P3): delete early

**Owner-only steps** are marked **(owner)**. They need the owner's Cloudflare account. Never paste secrets into chat.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- App: `src/`
- Pages Functions: `functions/` (repo root)
- Tests: `tests/share/`
- Real save for manual checks: `~/Downloads/MP_RUS_1657_01_03_7a5f6d56-dd37-4edb-aa18-f35de833364a.eu5`
- Small fixture: `tests/fixtures/rus-1628-minimal.eu5`

---

## Phase 1: Setup

- [X] T001 Add dependencies: `npm install brotli-wasm@3.0.1` and `npm install -D wrangler @cloudflare/workers-types`. In `tsconfig.json`, add `functions` to `include`. Add `functions/tsconfig.json` extending the root config with `"types": ["@cloudflare/workers-types"]` and no DOM lib, so the Workers globals type-check separately from the app.
- [X] T002 Create `wrangler.toml` at the repo root:
  - `name = "nauticalbeg"`, `pages_build_output_dir = "dist"`, `compatibility_date = "2026-09-01"`
  - `[[r2_buckets]] binding = "SHARES"`, `bucket_name = "nauticalbeg-shares"`
  - `[[kv_namespaces]] binding = "SHARE_LIMITS"`, `id = "<PROD_KV_ID>"`
  - `[vars] SHARE_TTL_SECONDS = "604800"`
  - `[env.preview]` with bucket `nauticalbeg-shares-preview`, KV `<PREVIEW_KV_ID>`, and the same var

  Leave the two KV IDs as clearly marked placeholders until T004. Comment that `RATE_LIMIT_SALT` is a dashboard secret, not in this file.
- [X] T003 Update `.github/workflows/ci.yml`. The `deploy` job must add `actions/checkout@v7` (sparse checkout: `functions`, `wrangler.toml`, `package.json`, `package-lock.json`) and `npm ci --omit=dev` before `wrangler pages deploy`, so `functions/` and the bindings deploy with the tested `dist/`. Add `npx tsc -p functions` to the `check` job.
- [X] T004 **(owner, done 2026-09-26)** Do quickstart Part A steps 1–5: enable R2, create the two buckets with 7-day lifecycle rules, create the two KV namespaces (send their IDs), and set the `RATE_LIMIT_SALT` secret for Production and Preview. Then fill the KV IDs into `wrangler.toml`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The snapshot format, export/import and the Functions skeleton. These are what makes "share" and "open" possible at all.

- [X] T005 **Spike, real browser + Cloudflare** (quickstart B4). This proves research R3's assumptions before building on them. Record the results in research.md as "R3 spike results".
  - brotli-wasm compresses a 20MB buffer in a Worker on `vite preview` with our isolation headers
  - a throwaway Function returns an R2 object with `Content-Encoding: br` (`encodeBody: "manual"`), and `fetch` yields decompressed bytes
  - `CREATE TABLE tmp AS` from `insertArrowTable` + `INSERT INTO t BY NAME SELECT * FROM tmp` works in DuckDB-Wasm
  - `/s/abc` on a Pages preview serves `index.html`

  Stop and report if any of these fails.
- [X] T006 [P] Write `tests/share/snapshotFormat.test.ts` (it must fail first) for `contracts/snapshot-format.md`:
  - encode→decode round-trip of manifest + streams
  - magic `NBSNAP`, u16 LE version, u32 LE manifest length at the exact offsets
  - `corrupt`: wrong magic, truncated manifest, bad JSON, a stream running past the end, trailing bytes, a declared length over 1GB
  - `incompatible`: version ≠ 1
- [X] T007 Implement `src/share/snapshotFormat.ts`: `encodeSnapshot(manifest, streams: Uint8Array[]): Uint8Array` and `decodeSnapshot(bytes): { manifest, streams }`. `SnapshotError` has `kind: "corrupt" | "incompatible"`. The decoder validates every length before slicing and refuses a total over 1,073,741,824 bytes. T006 passes.
- [X] T008 Implement `src/share/exportSnapshot.ts`: `exportSnapshot(db: SaveDatabase, onProgress)`. It lists `information_schema.tables` (schema `main`), **excludes `raw_sections`**, and orders tables alphabetically. Each table is `SELECT * FROM t` → `tableToIPC(table, "stream")`. For `save_meta`, it selects `* REPLACE ('Shared game' AS filename)`. The manifest gets `{ appVersion: __APP_VERSION__, createdAt, summary: { inGameDate, playerNationTag }, tables: [{ name, rows, bytes, columns }] }`. Progress is reported per table.
- [X] T009 Implement `src/parser/import-snapshot.ts`: `importSnapshot(bytes, callbacks, signal)`, mirroring `loadSave`'s callback shape:
  - decode the container
  - new `saveId`, `openSaveDatabase`, `applySchema`
  - check every manifest table and column against `information_schema.columns`; a missing one raises `SnapshotError("incompatible")`
  - per table: `tableFromIPC` → `insertArrowTable({ name: "tmp_import", create: true })` → `INSERT INTO <t> BY NAME SELECT * FROM tmp_import` → `DROP TABLE tmp_import`
  - progress weighted by bytes
  - close before `onReady`, and delete the database on failure or cancel (same `finally` pattern as `loadSave`)
- [X] T010 Write `tests/share/roundtrip.test.ts` (SC-003, SC-005) on the Node DuckDB harness:
  1. `loadSave(rus-1628-minimal.eu5)`, then `exportSnapshot`, `encodeSnapshot`, `decodeSnapshot`, `importSnapshot`
  2. Every table except `raw_sections` has identical rows (`ORDER BY ALL`) in the source and the import. `save_meta.filename` = "Shared game".
  3. `raw_sections` is empty in the import and absent from the manifest.

  Also: a manifest with an unknown table gives `incompatible`; a manifest missing a column that exists now imports it as NULL (additive tolerance).
- [X] T011 Add to `src/parser/protocol.ts`:
  - request `{ type: "import-share", id: string }`
  - `ParsePhase` values `"downloading"` and `"importing"`
  - `ErrorKind` values `"share-expired" | "share-deleted" | "share-not-found" | "share-unavailable" | "share-incompatible" | "share-corrupt"`

  In `src/parser/worker.ts`, handle `import-share`:
  - fetch `/api/shares/<id>`, reporting download progress against `X-Uncompressed-Length`
  - map 404/410 codes to the error kinds (`expired`, `deleted`, `not_found`); map network/5xx to `share-unavailable`
  - call `importSnapshot`
  - on ready, include `shared: { id, expiresAt }` from `X-Expires-At`

  Cancellation must work the same way as `load`. Add titles for the new kinds to `ErrorMessage.tsx`'s `TITLES`, per `contracts/share-ui.md`.
- [X] T012 [P] Implement `functions/api/shares/_lib/ids.ts`:
  - `newShareId(nowMs)`: 6-byte BE seconds + 16 random bytes → base64url, 30 characters
  - `isValidId(id)`: `^[A-Za-z0-9_-]{30}$`
  - `idCreatedAtMs(id)`
  - `newDeleteKey()`: 32 random bytes, base64url
  - `sha256Hex(s)`
  - `timingSafeEqualHex(a, b)`

  Implement `functions/api/shares/_lib/responses.ts` (JSON error helper `{ error, message, ...extra }`). Tests go in `tests/share/ids.test.ts`.

**Checkpoint**: A snapshot round-trips losslessly in tests, and the worker can import one from a URL.

---

## Phase 3: User Story 1 - Share what I'm looking at (P1) 🎯 MVP (with US2)

**Goal**: Click Share → confirm → progress → a copyable link with its expiry.

**Independent Test**: quickstart C1, C2.

- [X] T013 [US1] Implement `functions/api/shares/index.ts` `onRequestPost` per `contracts/shares-api.md`, checks 1, 2 and 5:
  - `Content-Length` required and ≤ 41,943,040, else `413 too_large { limitBytes }`
  - `X-Snapshot-Format` is `"1"`, else `400`
  - `id = newShareId(Date.now())`, `deleteKey = newDeleteKey()`
  - `env.SHARES.put("shares/" + id, request.body, { customMetadata: { createdAt, deleteKeyHash, uncompressedLength, formatVersion } })`, **streamed, never read**
  - return `201 { id, url: new URL("/s/" + id, request.url).href, expiresAt, deleteKey }`
  - a failed put returns `500 unavailable`

  Rate limit and budget come in US3 (T024).
- [X] T014 [P] [US1] Write `tests/share/functions.test.ts`: call `onRequestPost` with fake `env` (in-memory R2/KV mocks) and check the status table: 201 shape, 413, 400, and put failure → 500. Assert the stored metadata contains `deleteKeyHash`, not the key.
- [X] T015 [P] [US1] Create `src/share/compress.worker.ts` + `src/share/compressClient.ts`. The worker takes the table streams, compresses with brotli-wasm's streaming `CompressStream` at quality 5 in chunks of about 4MB, posts progress (input bytes consumed / total), supports `cancel`, and returns the `Uint8Array` via transfer.
- [X] T016 [US1] Implement `src/share/shareClient.ts`:
  - `createShare(compressed, uncompressedLength, { onProgress, signal })` via `XMLHttpRequest` (`upload.onprogress`), headers `X-Snapshot-Format: 1` and `X-Uncompressed-Length`. It maps error JSON codes to typed errors (`too_large | rate_limited{retryAfterSeconds} | busy | unavailable | network`).
  - `deleteShare(id, deleteKey)`.
- [X] T017 [US1] Implement `src/share/shareLinks.ts`: the `localStorage` key `nauticalbeg.shares` holding `{ id, url, expiresAt, deleteKey }[]`. Expired entries are pruned on read. Every access goes through try/catch; if storage is blocked, early delete is hidden (data-model.md). Also `parseShareIdFromPath(pathname)` for `/s/<id>`. Tests go in `tests/share/shareLinks.test.ts`.
- [X] T018 [US1] Create `src/components/Overview/ShareDialog.tsx` + `.css` with the states in `contracts/share-ui.md`: Confirm (exact text including player names and the local-time expiry), Too large, Working (Preparing → Compressing → Uploading n%, updating ≥1/s, Cancel), Done (read-only link, Copy link → "Copied", expiry, Delete this link with inline confirm), and Error (mapped messages).
  - Modal with focus trapped; Esc cancels. No `window.confirm` and no `title=` tooltips.
  - It gets a `SaveDatabase` from `FileLoader`'s `readDbRef` and orchestrates `exportSnapshot` → `encodeSnapshot` → size precheck (≤ 40MB after compression) → compress → upload → save to `shareLinks`.
- [X] T019 [US1] Add a **Share** button to `src/components/Overview/TopBar.tsx`, next to Keep. It's visible only when a save is loaded **and** the session isn't a shared game. Wire it in `FileLoader.tsx` to open `ShareDialog`.
- [X] T020 [US1] Real-browser check (quickstart C1, C2 locally via `npx wrangler pages dev dist` with local R2/KV):
  - on `MP_RUS_1657`, no network activity before confirming
  - progress every second
  - the link is produced
  - record the compressed size, which should be about 13MB (research R1), and the timings in research.md

---

## Phase 4: User Story 2 - Open a shared game (P1) 🎯 MVP (with US1)

**Goal**: `/s/<id>` opens the same game for anyone.

**Independent Test**: quickstart C3, C4, C10.

- [X] T021 [US2] Implement `functions/api/shares/[id].ts` `onRequestGet` per the contract's GET table:
  - `isValidId`
  - `SHARES.get("shares/" + id)` → if the age ≥ `SHARE_TTL_SECONDS`, delete it and return `410 expired`
  - otherwise return a `Response(object.body, { encodeBody: "manual", headers: { "Content-Encoding": "br", "Content-Type": "application/octet-stream", "X-Uncompressed-Length", "X-Expires-At", "Cache-Control": "private, no-store" } })`
  - if missing: check `tombstones/<id>` → `410 deleted`; otherwise use the ID's embedded timestamp → `410 expired` or `404 not_found`

  Add cases to `tests/share/functions.test.ts`.
- [X] T022 [US2] In `src/components/Overview/FileLoader.tsx`, on startup: if `parseShareIdFromPath(location.pathname)` returns an ID, skip the kept-save offer and post `import-share`.
  - On ready, set `shared: { id, expiresAt }` in state and keep the URL.
  - Loading a local file clears `shared` and calls `history.replaceState(null, "", "/")`.
  - A kept save must never be deleted or overwritten by this path (FR-010).
  - New progress phases display as "Downloading shared game…" and "Loading shared game…".
- [X] T023 [US2] In `TopBar.tsx`, when `shared` is set, the loaded-file label reads `Shared game · expires {date}` (FR-009). Keep stays available. Create `src/components/Overview/SharedLinkMessage.tsx` for the six cases in `contracts/share-ui.md`, each with a "Load your own save" pointer, and render it for the `share-*` error kinds instead of the generic `ErrorMessage`.

---

## Phase 5: User Story 3 - Links expire and can't be abused (P1)

**Goal**: The 7-day expiry, rate limit and daily budget hold, and every refusal has a distinct message.

**Independent Test**: quickstart C6, C8, C9.

- [X] T024 [US3] Implement `functions/api/shares/_lib/limits.ts`:
  - `visitorHash(ip, salt)`: first 16 hex characters of SHA-256(ip ‖ salt)
  - `checkAndCountRate(kv, hash, now)`: key `rl:<hash>:<UTC yyyymmddhh>`, limit **5**, TTL 3600; returns `{ ok } | { retryAfterSeconds }`
  - `checkBudget(kv, bytes, now)`: key `bytes:<UTC yyyymmdd>`, refuse when the total would exceed **1,300,000,000**, TTL 172,800
  - `recordBudget(...)`

  Call them in `onRequestPost` as contract checks 3–4 (`429 rate_limited` + `Retry-After`, `503 busy`), counting only after a successful put. A KV failure on the *read* path fails closed (`503 busy`); a failure on the *counter write* is ignored. Tests: pure logic plus handler cases in `tests/share/functions.test.ts`.
- [X] T025 [US3] Apply the size precheck in `ShareDialog`, before upload: show "{X} MB compressed; limit 40 MB" with no request made (FR-015, US3 #4). Show the rate-limited message with minutes rounded up (US3 #5).
- [X] T026 [US3] Deploy to a **preview** (open this feature's PR; this also covers 016's deferred T027/T031) with `SHARE_TTL_SECONDS=120` set for Preview only. Run quickstart C6 (open before 2 minutes, "expired" after), C8 (the sixth share in an hour is refused), C9 (a mistyped link shows "not found"; cancelling mid-upload leaves no object), and C11 (a PR comment appears; a deliberately failing test blocks deploy). Then restore preview's `SHARE_TTL_SECONDS` to 604800.

---

## Phase 6: User Story 4 - Take a shared link down early (P3)

**Goal**: The sharer can delete their own link, and no one else can.

**Independent Test**: quickstart C7.

- [X] T027 [US4] Implement `onRequestDelete` in `functions/api/shares/[id].ts`:
  - `Authorization: Bearer <key>`
  - `timingSafeEqualHex(sha256Hex(key), meta.deleteKeyHash)` → delete `shares/<id>`, put `tombstones/<id>` with `{ deletedAt }`, return `204`
  - wrong or missing key → `403 forbidden`; no active share → `404`

  Tests in `tests/share/functions.test.ts`.
- [X] T028 [US4] In `ShareDialog`'s Done state, and in a small "Your shared links" list inside the dialog (entries from `shareLinks.ts`, not expired), **Delete this link** calls `deleteShare`, removes the entry, and shows "Link deleted".

---

## Phase 7: Polish & Cross-Cutting

- [X] T029 [P] Write `docs/sharing.md` (FR-019):
  - what is stored: analysed tables, no file name, no raw sections, player names included
  - for how long: 7 days, deleted within 24h after
  - why
  - what is not stored: raw IPs, logs
  - setup (quickstart Part A) and operations (lowering TTL in preview, checking the budget)

  Add a short plain-language "Sharing & privacy" note on the site, linked from the Share dialog, and a README section.
- [X] T030 [P] Update `.specify/memory/security_constitution.md` §1/§3/§4/§6/§7/§8 for the Functions API. **Leave it uncommitted, per the owner.** Update `ARCHITECTURE.md` with a "Game state sharing (017)" section: format, compression measurements, Functions/R2/KV, limits, and the Parquet dead end.
- [X] T031 **Marked done 2026-09-26 by owner decision.** Production check (quickstart C2–C5, C7, C10) on `https://nauticalbeg.pages.dev` with `MP_RUS_1657`. Real-save steps the owner has to do by hand (Chrome blocks localhost injection on the public site) are listed for the owner. Confirm SC-003's zero differences on the Overview plus 5 map modes, and SC-005 by downloading and decoding a stored object.
- [X] T032 **Marked done 2026-09-26 by owner decision.** Full `npx tsc -b && npx tsc -p functions && npx vitest run --maxWorkers=2`; everything passes. Then wrap up: tasks notes, `specs/spec-status.md`, memory, scoped commit, push.

---

## Dependencies & Execution Order

- **Setup (T001–T004)**: T004 (owner) blocks any deploy; the code can proceed without it.
- **Foundational (T005–T012)**: T005 (spike) gates T007–T011. T006 → T007. T007 + T008 + T009 → T010. T011 needs T009.
- **US1 (T013–T020)** needs Foundational. **US2 (T021–T023)** needs T011 and T013 (to have something to open). US1 and US2 together are the MVP.
- **US3 (T024–T026)** needs T013 and T021. T026 needs a deploy (T003, T004).
- **US4 (T027–T028)** needs T013, T017 and T021.
- **Polish** comes last. T031 needs everything deployed.

## Parallel Opportunities

- T006 ∥ T012 (format tests vs. ID helpers)
- T014 ∥ T015 (Function tests vs. compression worker)
- T029 ∥ T030 (docs)
- The owner's T004 runs alongside all code work

## Implementation Strategy

1. **MVP**: Phases 1–4 (share + open), validated locally with `wrangler pages dev`.
2. **Before production**: US3's limits and expiry. They're P1 because the constitution and the $0 budget depend on them. Ship the MVP to a preview, not production, until T024 lands.
3. **Then**: US4 (early delete), docs, and the production check.
