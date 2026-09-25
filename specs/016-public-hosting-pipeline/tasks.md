---

description: "Task list for Public Hosting & Deployment Pipeline"
---

# Tasks: Public Hosting & Deployment Pipeline

**Input**: Design documents from `/specs/016-public-hosting-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pipeline.md, contracts/hosting-headers.md, contracts/engine-loading.md, quickstart.md

**Closed 2026-09-25 (owner's call, to move on to 017)**: the site is live and deploys automatically from `main`. Deferred, with the reason for each:
- **T026**: C3 (real save on the live site) couldn't be automated, because Chrome blocks public-site fetches to localhost. The owner loaded the site but not the real save. Firefox/Safari, C6 keep/resume and C7 private window are unchecked on the live site. C1, C2 and C5 passed.
- **T027/T031**: the PR preview and failure-path flow hasn't been exercised yet. Do it on 017's first PR.
- **T028**: the rollback rehearsal is owner-only and hasn't been done. The steps are in `docs/hosting.md`.
- **T033**: count flaky runs over the next 10 pipeline runs. So far 3 of 3 runs had passing checks.
- **T034**: owner-only; check the bill after a week.
- Post-close extras, already live in ff15674: the page title/tagline above the nav bar was removed, and map pan/zoom is locked to the map's edges (`mapView.ts`).

**Implementation notes (2026-09-25)**:
- **Flaky test**: T002's first fix, which moved the assertions into `waitFor`, wasn't enough. It still failed 4/30 sequentially and 15/30 under 10-way concurrent stress, always in the tooltip test. The actual race: before the country selection resolves, `RulerHistoryChart` sets `history` to an empty Map, so the chart renders once with the correct axis range but no series. That test waited on the axis range alone. It now waits for the loaded series too. Result: 30/30 sequential and 30/30 under stress. No `retry` was needed.
- **T007**: the local `.wasm` imports became dynamic imports inside a `!import.meta.env.PROD` branch. The production build dropped from 126MB to 58MB and contains no engine `.wasm`. `1.32.0` is inlined into both the main and parser-worker bundles.
- **T008**: added an `EngineUnavailableError` class in `db.ts`, thrown around `instantiate()`, and caught in both `loadSave` and `resumeSave`.
- **T018**: `vite preview` in Chrome with the real `MP_RUS_1657` save (injected via page JS from a throwaway localhost server, since the file-upload tool caps at 10MB). `crossOriginIsolated` was true. The save loaded, and the Overview card was identical to the dev build: Russia, 1657.1.3, treasury 6,383.6, stability 21.3, development 6,104.8, 288 provinces. The Atlas map rendered. The engine `.wasm` fetch doesn't show in the page's network log because DuckDB's own worker makes it. It must have come from jsDelivr, since `dist/` contains no copy. Under a load average of ~12, both builds sat at about 60% ("Parsing") for minutes. That's the existing parse speed on a busy machine, not this feature.
- **New finding, open decision**: the browser check showed a second third-party request that has existed since 001. `src/styles/tokens.css` `@import`s Google Fonts. It's now recorded in the security constitution §6 and ARCHITECTURE.md. Whether to self-host the two fonts (which removes Google seeing visitor IPs) is the owner's call. Until then, quickstart C4's expected origins are the site, jsDelivr **and** Google Fonts.
- **T021/T029/T030** were written as one `ci.yml`, with the PR preview parts included. They're still unverified until the first real runs (T025, T031).
- **T025 (live)**: the first run (29201ad) failed at the deploy step with "Pages project does not exist". The owner had created a **Worker** named `nauticalbeg`, because Cloudflare's Create flow now defaults to Workers. The checks passed, and the token authenticated fine. After a Pages project was created, run 36145788394 (e47c1db, which also bumped the actions to current majors because of a Node 20 deprecation warning) passed. Checks 2m28s, deploy 46s, about 4.5 minutes push-to-live (SC-004 ✓). Live checks:
  - both isolation headers on `/`, which also revalidates every load
  - `/assets/*` immutable, one year, Brotli
  - map data served with ETags
  - `crossOriginIsolated` true; footer shows `ve47c1db`
  - first visit: start screen at 1.2s, about 1MB transferred (SC-001 ✓)
  - reload: 1KB transferred, 335ms (SC-003 ✓)
  - Loading the real save on the live site couldn't be automated: Chrome blocks a public site's fetch to a localhost file server (local network access), so C3 needs a manual file drop.
- **T032**: `tsc -b` is clean; `vitest run --maxWorkers=2` passes 502/502 in 2m10s.

**Tests**: A few targeted unit tests are included because the plan names them: engine URL selection, the dist check, and the `_headers` presence check. The spec also requires fixing the known-flaky test (FR-011). No other TDD scaffolding. Most of the verification is real-browser and hosted, in quickstart.md.

**Organization**: Grouped by user story from spec.md:
- US1 (P1): open NauticalBeg from a public link
- US2 (P1): pushes to `main` deploy automatically
- US3 (P2): pull request previews

**Owner-only steps**: tasks marked **(owner)** need the project owner's own accounts (Cloudflare, GitHub settings). Claude cannot and must not do them. Never paste the API token into chat.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 per spec.md

## Path Conventions

Single client-only project. App code: `src/`. Tests: `tests/`. Build tools: `tools/`. Pipeline: `.github/workflows/`. Runbook: `docs/hosting.md`. Real save for manual checks: `~/Downloads/MP_RUS_1657_01_03_7a5f6d56-dd37-4edb-aa18-f35de833364a.eu5`.

Shell note: if tests time out en masse locally, check `uptime` first (the owner's Mac is often under heavy load). Rerun with `--maxWorkers=3` before investigating.

---

## Phase 1: Setup

**Purpose**: Make the test suite reliable enough to gate deploys. Every story depends on this.

- [X] T001 In `vitest.config.ts`, add `testTimeout: 60000` and `hookTimeout: 60000` under `test` (research R7), with a one-line comment: DuckDB-heavy tests exceed the 5s default on busy machines and small CI runners.
- [X] T002 Fix the render race in `tests/components/RulerHistoryChart.test.tsx` (research R7). Every test that does `await waitFor(() => expect(leaderboardData.loadRulerHistory).toHaveBeenCalledWith(...))` and then reads `vi.mocked(LeaderboardChart).mock.calls.at(-1)` must instead move the props assertion *inside* the `waitFor`, so it retries until the post-load re-render has happened. Also add `afterEach(() => vi.restoreAllMocks())` so `vi.spyOn` spies don't leak between tests. Do not add `retry`.
- [X] T003 Verify T002: run `for i in $(seq 30); do npx vitest run tests/components/RulerHistoryChart.test.tsx || break; done` and confirm 30/30 pass. If it still fails, find the real cause. Only if none can be found, add `{ retry: 2 }` to the specific failing test(s), with a comment explaining why, and record it in research.md R7. Never retry the whole suite (FR-011).

---

## Phase 2: Foundational (blocks every story)

**Purpose**: A production build that fits the host: no file over 25 MiB, correct headers, and a check that enforces both.

- [X] T004 [P] Create `src/storage/engineUrls.ts` exporting `duckdbBundleUrls(opts: { production: boolean; version: string; local: { mvpWasm: string; ehWasm: string; mvpWorker: string; ehWorker: string } }): duckdb.DuckDBBundles` per `contracts/engine-loading.md`:
  - when `production`, `mainModule` is `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist/duckdb-mvp.wasm` (or `duckdb-eh.wasm` for `eh`)
  - otherwise it's the local URL
  - `mainWorker` is always the local worker URL

  Keep it a pure function with no imports besides the DuckDB type, so it is unit-testable.
- [X] T005 [P] Create `tests/storage/engine-urls.test.ts` covering the three cases in `contracts/engine-loading.md`:
  - local URLs when `production: false`
  - jsDelivr URLs with the exact pinned version when `production: true`, for both `mvp` and `eh`
  - worker URLs local in both modes
- [X] T006 In `vite.config.ts`, read the installed DuckDB version from `node_modules/@duckdb/duckdb-wasm/package.json` (`readFileSync` + `JSON.parse`) and add `define`:
  - `__DUCKDB_VERSION__: JSON.stringify(version)`
  - `__APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? <git rev-parse --short HEAD via execSync, try/catch> ?? "dev")` (research R8)

  Declare both as `declare const __DUCKDB_VERSION__: string; declare const __APP_VERSION__: string;` in `src/vite-env.d.ts`. Make sure vitest (which uses a separate `vitest.config.ts`) still type-checks and runs: add the same two `define` entries there with test values (`"test"`) if needed.
- [X] T007 Change `createProductionConnection` in `src/storage/db.ts` to build `MANUAL_BUNDLES` via `duckdbBundleUrls({ production: import.meta.env.PROD, version: __DUCKDB_VERSION__, local: {...} })`. The production build must not emit `duckdb-mvp.wasm` or `duckdb-eh.wasm` into `dist/`. Because static `?url` imports always emit their files, switch the two `.wasm` `?url` imports to a dev-only path. For example, use `import.meta.env.PROD ? null : await import("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url")` inside the function, or `new URL(..., import.meta.url)` guarded by `import.meta.env.DEV`, so Rollup tree-shakes them out of production. Confirm with `npm run build && ls dist/assets | grep -c 'duckdb-.*\.wasm'` returning `0`. Keep the worker `?url` imports as they are.
- [X] T008 Add error kind `"engine-unavailable"` to `ErrorKind` in `src/parser/protocol.ts`. In `src/parser/load-save.ts`, wrap both `openSaveDatabase(saveId)` calls (lines ~194 and ~259) so a failure to fetch or instantiate the engine reports `onError("engine-unavailable", "Couldn't download the database engine. Check your connection and try again.")` instead of a generic failure (contracts/engine-loading.md "Failure"). Add a heading for it in the map in `src/components/Overview/ErrorMessage.tsx` (e.g. `"engine-unavailable": "Couldn't Load the Database Engine"`). Add a case to `tests/parser/load-save-formats.test.ts` that makes the connection factory throw and asserts the new kind.
- [X] T009 [P] Create `public/_headers` with exactly the rules in `contracts/hosting-headers.md`: `/*` gets COOP `same-origin`, COEP `require-corp`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`. Add a comment at the `server.headers` block in `vite.config.ts` saying these must stay in sync with `public/_headers`.
- [X] T010 [P] Create `tools/check-dist/check-dist.ts` (run with `tsx`, like the other `tools/*`). Export a pure `checkDist(dir: string): string[]` returning problems, plus a CLI entry that prints them and exits 1 if there are any. Problems:
  - any file larger than 26,214,400 bytes (25 MiB), naming the path and size in MB
  - any file ending `.png .jpg .jpeg .webp .dds .tga` (research R10), naming the path
  - `_headers` missing, or missing either isolation header

  Add `"check:dist": "tsx tools/check-dist/check-dist.ts dist"` to `package.json` scripts.
- [X] T011 [P] Create `tests/tools/check-dist.test.ts`. Build throwaway directories under the test temp folder (use the existing `tests/global-temp-dir.ts` convention) and assert that `checkDist`:
  - passes a clean tree
  - flags a 26MB file by name (write a sparse file with `truncate`/`fs.ftruncate` to avoid real I/O)
  - flags a `.png`
  - flags a missing or incomplete `_headers`
- [X] T012 Run `npm run build && npm run check:dist` and confirm it passes and `dist/assets` has no DuckDB `.wasm` (quickstart B1). Then do quickstart B2: copy a 30MB file into `public/`, rebuild, confirm `check:dist` fails naming it, and remove the file.

**Checkpoint**: The production build fits Cloudflare Pages and carries the right headers.

---

## Phase 3: User Story 1 - Open NauticalBeg from a link (Priority: P1) 🎯 MVP

**Goal**: A stranger opens the public address and uses the full app. Saves never leave their machine.

**Independent Test**: quickstart C2–C7 on the public address, loading `MP_RUS_1657`.

- [X] T013 [P] [US1] Create `src/browserSupport.ts` exporting `missingCapabilities(): string[]`. It checks `typeof WebAssembly === "object"`, `typeof Worker === "function"`, and `typeof navigator.storage?.getDirectory === "function"`, then *actually* awaits `navigator.storage.getDirectory()` in an async variant `checkBrowserSupport(): Promise<string[]>`, because Firefox private windows expose the function but reject it. Return human-readable names ("WebAssembly", "Web Workers", "private file storage (blocked in private/incognito windows)"). Add `tests/browserSupport.test.ts` covering "all present" and "storage rejects".
- [X] T014 [US1] In `src/app.tsx`, run `checkBrowserSupport()` on mount. While it's pending, render nothing extra. If anything is missing, render a plain message instead of `<FileLoader />`: "NauticalBeg can't run in this browser window: missing {list}. Try a normal (non-private) window in an up-to-date Chrome, Firefox or Safari." (FR-008). Use existing style tokens from `src/styles/`. No new colors.
- [X] T015 [US1] Add a small footer in `src/app.tsx` (and a CSS file alongside, if the app keeps styles per component). Show the text "Unofficial fan tool — not affiliated with Paradox Interactive." (FR-016) and `v{__APP_VERSION__}` (FR-007), in muted text using existing tokens and meeting contrast (constitution VI). It must stay visible on the start screen and after a save loads. Use plain text only; no `title=` tooltips (project convention).
- [X] T016 [US1] Update `.specify/memory/security_constitution.md`:
  - §6 records jsDelivr as the single third-party request: what it serves (the DuckDB engine `.wasm`, pinned version), that it carries no app or save data, and the failure behavior (`engine-unavailable`)
  - §3 notes that hosting adds no analytics or telemetry
  - bump its version/date the way that file does
- [X] T017 [US1] Update `ARCHITECTURE.md`:
  - new "Hosting" section: Cloudflare Pages static hosting, the engine `.wasm` from jsDelivr in production only, and why (25 MiB limit, research R2)
  - the caching model from `contracts/hosting-headers.md`
  - update the "Cross-origin isolation headers" section so it points to `public/_headers` as the production copy
  - change the intro's "no backend" wording so it stays true: "static hosting, no backend"
- [X] T018 [US1] Real-browser check on `npx vite preview` (quickstart B3): load `MP_RUS_1657` in Chrome via claude-in-chrome, and confirm in the network panel that the `.wasm` comes from `cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/...` and the save reaches the loaded state with the right date and nation. Leave the preview server running afterwards (project convention).
- [X] T019 [US1] **(owner)** Do quickstart Part A steps 1–5: create the Cloudflare account, create the `nauticalbeg` Direct Upload Pages project with production branch `main`, create the API token with only Account → Cloudflare Pages → Edit, and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets. Tell Claude the final project name and `pages.dev` address. Never share the token.
- [X] T020 [US1] **(owner)** Quickstart Part A step 6: confirm with pdx.tools that serving `tokens/eu5.flat` from a public site is covered. **Blocks the first production deploy (T025).** Record the answer and date in `public/tokens/README.md`.

**Checkpoint**: The app is ready to host. It still needs the pipeline (US2) to actually go live.

---

## Phase 4: User Story 2 - Changes reach the public site automatically (Priority: P1)

**Goal**: A push to `main` that passes the checks goes live with no manual step. A failing push doesn't. Rollback takes under 5 minutes.

**Independent Test**: quickstart C1, C9 (on `main`) and C10.

- [X] T021 [US2] Create `.github/workflows/ci.yml` implementing `contracts/pipeline.md` for `push` to `main` (the PR parts come in US3):
  - workflow `env: PAGES_PROJECT: <name from T019>`
  - default `permissions: contents: read`
  - job `check` on `ubuntu-latest`: `actions/checkout@v4`; `actions/setup-node@v4` with `node-version: 24`, `cache: npm`; `npm ci`; `npx tsc -b`; `npx vitest run --maxWorkers=2`; `npx vite build`; `npm run check:dist`; then `actions/upload-artifact@v4` with name `site`, path `dist`
  - job `deploy`: `needs: check`, `if: github.event_name == 'push'`, `concurrency: { group: deploy-production, cancel-in-progress: false }`, `permissions: contents: read, deployments: write`; `actions/download-artifact@v4` into `dist`; `cloudflare/wrangler-action@v4` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: pages deploy dist --project-name=${{ env.PAGES_PROJECT }} --branch=main`

  The build step must see `GITHUB_SHA` (it does by default). Never `echo` a secret.
- [X] T022 [P] [US2] Note in `Dockerfile`'s header comment that production hosting is Cloudflare Pages via `.github/workflows/ci.yml`, and this image stays dev-only. Remove the "add a build/serve stage here when static hosting is set up" line.
- [X] T023 [P] [US2] Create `docs/hosting.md`, the runbook the owner can follow without this conversation (FR-013, FR-015):
  - one-time setup (quickstart Part A, verbatim steps)
  - how deploys work (the trigger table from `contracts/pipeline.md`)
  - **rollback**: Pages project → Deployments → previous production deploy → "Rollback to this deployment" (research R6)
  - **token rotation**: create a new token with the same single permission, update the GitHub secret, revoke the old one
  - what to do if a deploy fails at the wrangler step (expired or missing secrets)
- [X] T024 [P] [US2] Update `README.md`: the public address from T019, a one-paragraph "How it's deployed" section pointing at `docs/hosting.md`, and a note that local development is unchanged (`npm run dev`).
- [X] T025 [US2] First production deploy (**after T019 and T020**): commit Phases 1–4 and push to `main`. Watch the run with `gh run watch`. Then verify quickstart C1 (version label matches the pushed SHA, live within 15 minutes) and C2 (headers on `index.html` and `/assets/*`, and the fan-tool notice) with `curl -sI` plus claude-in-chrome.
- [ ] T026 [US2] **Deferred at close-out 2026-09-25 (user decision), see notes at top.** Hosted checks for US1: quickstart C3 (load `MP_RUS_1657` on the public site in Chrome; ask the owner to spot-check Firefox and Safari), C4 (network panel shows only the site's own origin and jsDelivr), C5 (reload with no deploy transfers under 1MB before the start screen), C6 (keep → reopen → resume) and C7 (Firefox private window shows the FR-008 message). Record the results in this file's notes.
- [ ] T027 [US2] **Deferred at close-out 2026-09-25 (user decision), see notes at top.** Failure path (FR-012): don't break `main` on purpose. `deploy` only runs after `check` passes (`needs: check`), and pushes and PRs use the same gate. So prove it with T031's deliberately failing PR commit: `check` fails naming the test, `deploy` shows as skipped, and the production version label is unchanged. Record the result against both T027 and T031.
- [ ] T028 [US2] **Deferred at close-out 2026-09-25 (user decision), see notes at top.** **(owner)** Rollback rehearsal (quickstart C10): with Claude timing it, roll back to the previous production deployment in the Pages dashboard, confirm the version label changes on a reload, then roll forward. Record the time. It must be under 5 minutes (SC-006).

**Checkpoint**: NauticalBeg is publicly live and deploys itself. This is the beta-ready MVP.

---

## Phase 5: User Story 3 - Preview a change before it goes public (Priority: P2)

**Goal**: Each same-repo PR gets its own preview URL. Forks get checks only.

**Independent Test**: quickstart C8 and C9.

- [X] T029 [US3] Extend `.github/workflows/ci.yml` per `contracts/pipeline.md`:
  - add the `pull_request` trigger
  - job-level `concurrency: { group: pr-${{ github.event.pull_request.number }}, cancel-in-progress: true }` for PR runs, keeping `deploy-production` for pushes
  - `deploy` condition becomes `github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository`
  - `--branch=` is `main` for pushes and `${{ github.head_ref }}` for PRs
  - add `pull-requests: write` to `deploy`'s permissions
- [X] T030 [US3] In the `deploy` job, for PRs only, post or update one sticky comment with the wrangler action's `deployment-url` output (give the wrangler step `id: wrangler` and read `steps.wrangler.outputs.deployment-url`). Use `actions/github-script@v7`: find an existing comment by a hidden marker `<!-- nauticalbeg-preview -->` and update it, otherwise create it. The body gives the preview URL and the short SHA.
- [ ] T031 [US3] **Deferred at close-out 2026-09-25 (user decision), see notes at top.** Verify quickstart C8 and C9: open a PR with a small visible change. Confirm the checks pass, the comment appears with a working preview URL, the preview shows the change, and production doesn't. Push a commit that breaks one test and confirm `check` fails naming the test, `deploy` is skipped, and production is unchanged. Revert the breaking commit, then close or merge the PR as the owner prefers.

**Checkpoint**: All three stories are working.

---

## Phase 6: Polish & Cross-Cutting

- [X] T032 [P] Run the full suite locally with `npx vitest run --maxWorkers=2` and `npx tsc -b`; all must pass (quickstart B5).
- [ ] T033 **Deferred at close-out 2026-09-25 (user decision), see notes at top.** Track quickstart C11: across the next 10 pipeline runs (including T025–T031), record any failure not caused by a real code problem. Target: zero (SC-005). Note the count in this file.
- [ ] T034 **Deferred at close-out 2026-09-25 (user decision), see notes at top.** **(owner)** Quickstart C12: after a week, confirm the Cloudflare bill shows $0 (SC-008).
- [X] T035 Session wrap-up per project convention: update `specs/spec-status.md`, fill in the implementation notes at the top of this file, make sure `ARCHITECTURE.md` matches what was built, then make a scoped commit and push.

---

## Dependencies & Execution Order

- **Phase 1 (T001–T003)**: no dependencies. Must finish before the pipeline gates on tests (T021).
- **Phase 2 (T004–T012)**: T004 → T005 and T007. T006 → T007. T007 → T008 and T012. T009 and T010 → T011 and T012.
- **US1 (T013–T020)**: needs Phase 2. T013 → T014. T019/T020 (owner) can happen any time in parallel with the code work.
- **US2 (T021–T028)**: needs Phase 1, Phase 2 and T019. The first production deploy (T025) also needs T020 and the US1 code (T013–T018).
- **US3 (T029–T031)**: needs T021 and a working deploy (T025).
- **Polish**: after the stories.

## Parallel Opportunities

- Phase 2: T004+T005, T009 and T010+T011 touch different files and can go together.
- US1: T013 in parallel with T016/T017 (docs).
- US2: T022, T023 and T024 (docs) in parallel with each other once T021 exists.
- The owner tasks (T019, T020) run alongside all the code work.

## Implementation Strategy

- **MVP**: Phases 1–4. After T025–T028, the site is live, deploys itself, and can be rolled back. That's everything the beta needs from 016.
- **Then**: US3 previews (T029–T031). They make every later feature, starting with 017, safer to ship.
- **Stop points**: after Phase 2, the build is host-ready even without an account. After Phase 3's code tasks, everything is ready and just waiting on the owner's Cloudflare setup (T019).
