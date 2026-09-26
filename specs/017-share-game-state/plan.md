# Implementation Plan: Share Game State by Link

**Branch**: `017-share-game-state` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-share-game-state/spec.md`

## Summary

A player with a loaded game clicks **Share**, confirms what will be uploaded, and gets a one-week link. Anyone opening the link gets the same game in their own browser, with no save file.

**How it works:**
- The "game state" is the per-save DuckDB database. It's exported as one Arrow IPC stream per table, minus `raw_sections` and the file name, packed into a small container and compressed in a Worker with Brotli at quality 5.
- Measured on the real 85MB multiplayer save: **181MB of tables becomes 13MB**. gzip only reached 51MB, and Parquet isn't available in this DuckDB build (research R1–R3).
- Storage is Cloudflare **R2**, reached through same-origin **Pages Functions** (`/api/shares`) that deploy with the site through the existing 016 pipeline.
- **KV** handles per-visitor rate limits and a daily byte budget that keeps storage inside R2's free 10GB.
- Links expire at exactly 7 days, enforced by the Function. R2 lifecycle rules delete the data within 24 hours after that.
- The viewer's browser gets the object with `Content-Encoding: br`, so it decompresses natively. The parser Worker then imports it into a fresh database, and every existing tab works unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) for both the app and Pages Functions (Workers runtime)

**Primary Dependencies**:
- existing: DuckDB-Wasm 1.32.0, apache-arrow 17, React 19, Vite
- **new runtime dependency**: `brotli-wasm` 3.0.1 (Apache-2.0), sharer side only, self-hosted
- **new dev dependencies**: `wrangler` (local Functions dev and tests), `@cloudflare/workers-types`

**Storage**:
- the browser's per-save DuckDB on OPFS (unchanged)
- **R2** buckets `nauticalbeg-shares` (production) and `nauticalbeg-shares-preview`
- **KV** namespaces `SHARE_LIMITS` (production and preview)

**Testing**:
- vitest for the container encoder/decoder, the export/import round-trip against the Node DuckDB test harness, ID/expiry logic, and Function handlers with mocked R2/KV
- real-browser and real-Cloudflare checks per quickstart.md

**Target Platform**: evergreen desktop browsers; Cloudflare Pages Functions (Workers runtime, free plan)

**Project Type**: client-heavy web app plus a thin same-origin serverless API

**Performance Goals**:
- share the real `MP_RUS_1657` game in under 1 minute at 20 Mbps up (13MB is about 5s of upload, plus export and compression)
- a viewer opens it faster than parsing the original save (SC-002)

**Constraints**:
- Function CPU under 10ms per request (stream, never parse)
- upload body at most 40MB (size cap, under the free plan's 100MB)
- live storage ≤ 9.1GB (daily byte budget)
- $0/month
- no raw IPs stored
- no third-party requests added

**Scale/Scope**: about 3 Function routes, 1 new Worker (compression), 1 import path in the parser Worker, a share dialog, shared-mode top-bar state, a container module, `wrangler.toml`, a pipeline tweak, and docs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Save handling / server retention | ✅ | This is the first server-side data, and it's allowed because it's **explicitly opt-in**: the confirmation dialog says what's uploaded, that anyone with the link can see it, and the exact 7-day expiry. The original file is never uploaded, only the analysed tables minus `raw_sections` and the file name. Storage is limited to 7 days and deleted within 24h after. Retention is documented (FR-019). |
| II. Parser test-first fixtures | ✅ N/A | The parser is unchanged. The snapshot codec gets its own fixture round-trip test (export fixture → container → import → identical tables). |
| III. Explicit version compatibility | ✅ | The container has a format version. Import checks every table and column against the current schema and fails loudly with a "different version" message instead of guessing (research R4). |
| IV. Accurate representation | ✅ | A viewer sees exactly the sharer's tables (SC-003, zero differences). Shared mode is clearly labelled. |
| V. Performance | ✅ | Compression runs in a Worker and import in the parser Worker. Progress updates at least once per second for export, compression, upload, download and import. |
| VI. Accessibility | ✅ | The dialog and messages are plain text with keyboard focus management. No colour-only states. |
| VII. Simplicity | ✅ | No accounts. One object per share, never updated. The API has three routes. Rejected: Parquet, a standalone Worker, presigned uploads, Durable Objects (research R2, R5, R6). |
| VIII. AI agent | ✅ N/A | |
| Tech: no Paradox art | ✅ | Snapshots contain only parsed data, the same as what's already in the viewer's browser. |
| Tech: server retention documented | ✅ | `docs/sharing.md` (what is stored, for how long, why), the site's privacy note, and the security constitution (kept uncommitted per the owner). |
| Security constitution §1/§3/§4/§6/§7/§8 | ⚠️ → ✅ | These all say "no server". They get updated to describe the Functions API, untrusted snapshot input, the KV salt secret, and no request logging. Per the owner, the file stays uncommitted, so the committed `docs/sharing.md` carries the retention statement FR-019 requires. |

No unjustified violations. **Post-design re-check**: the contracts add nothing beyond these rows.

## Project Structure

### Documentation (this feature)

```text
specs/017-share-game-state/
├── plan.md
├── research.md          # measurements, format, backend, limits, cost
├── data-model.md        # snapshot, container, share object, KV records, client share record
├── quickstart.md        # owner setup + validation scenarios
├── contracts/
│   ├── shares-api.md        # POST/GET/DELETE /api/shares
│   ├── snapshot-format.md   # container bytes, manifest, import rules
│   └── share-ui.md          # dialog, states, messages, shared-mode top bar
└── tasks.md
```

### Source Code (repository root)

```text
functions/                         # NEW: Cloudflare Pages Functions (same origin)
└── api/shares/
    ├── index.ts                   # POST: rate limit, budget, size cap, stream to R2
    ├── [id].ts                    # GET (stream, Content-Encoding: br) / DELETE (delete key)
    └── _lib/                      # ids.ts, limits.ts, responses.ts (pure, unit-tested)
wrangler.toml                      # NEW: pages_build_output_dir, R2 + KV bindings, prod/preview env

src/
├── share/                         # NEW
│   ├── snapshotFormat.ts          # container encode/decode (pure)
│   ├── exportSnapshot.ts          # tables → Arrow IPC via the read connection
│   ├── compress.worker.ts         # brotli-wasm q5, progress
│   ├── shareClient.ts             # XHR upload w/ progress, GET/DELETE, error mapping
│   └── shareLinks.ts              # /s/<id> parsing, delete keys in localStorage
├── parser/
│   ├── import-snapshot.ts         # NEW: decode → fresh DB → INSERT BY NAME
│   ├── worker.ts / protocol.ts    # CHANGED: "import-share" request + progress phases
└── components/Overview/
    ├── ShareDialog.tsx/.css       # NEW: confirm → progress → link/expiry/copy/delete
    ├── SharedLinkMessage.tsx      # NEW: expired / not found / deleted / unavailable / version
    ├── TopBar.tsx                 # CHANGED: Share button; shared-mode label
    └── FileLoader.tsx             # CHANGED: route /s/<id> on startup; shared-mode state

tests/share/                       # NEW: format, export↔import round-trip, ids/limits, handlers
docs/sharing.md                    # NEW: what's stored, how long, why; setup; ops
.github/workflows/ci.yml           # CHANGED: deploy job gets functions/ + wrangler.toml
```

**Structure Decision**: The app stays one Vite project. The backend is Pages Functions in `functions/` at the repo root, where Cloudflare's tooling expects it, deployed by the same `wrangler pages deploy` step. Shared logic stays in pure modules on each side so it's testable in vitest without Cloudflare.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| First server component (Functions + R2 + KV) | Links must work without the sharer online, and the spec requires links rather than files | A file export was explicitly rejected by the owner. Peer-to-peer needs both people online at once. |
| `brotli-wasm` dependency | gzip (the only built-in browser compressor) is 4× larger (51MB vs 13MB), which quarters free-tier capacity and risks the 100MB body limit on bigger saves | Native `CompressionStream` gzip: measured at 50.8MB |
