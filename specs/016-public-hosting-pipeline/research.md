# Research: Public Hosting & Deployment Pipeline (016)

Findings gathered 2026-09-25 while planning. Each entry: decision, rationale, alternatives.

## R1. Host limits (Cloudflare Pages)

Checked against Cloudflare's published limits page on 2026-09-25:

- **25 MiB maximum per file.** This is the constraint that shapes the plan (see R2).
- 20,000 files per site on the free plan. The build has a few hundred, so this is not a concern.
- `_headers` file: up to 100 rules, 2,000 characters per header. Enough for R3 and R4.
- Unlimited preview deployments.
- Builds per month (500 on free) only count Cloudflare-side builds. We build in GitHub Actions and upload the result (R5), so this limit doesn't apply.

**Decision**: Cloudflare Pages, "Direct Upload" project (the pipeline uploads a finished `dist/`), on `*.pages.dev`.
**Alternatives**: Cloudflare's own Git integration builds on Cloudflare and gives previews for free, but its checks run separately from the deploy, so it can't enforce "deploy only if tests pass" (FR-009) without extra wiring. It was also not the owner's choice (GitHub Actions). GitHub Pages can't send custom headers (R3).

## R2. The two DuckDB engine files are over the 25 MiB limit

Current `dist/assets/`: `duckdb-mvp.wasm` 39.4MB and `duckdb-eh.wasm` 34.2MB. Everything else is under 3.2MB except the two map files (15–16MB, under the limit). The files come from `src/storage/db.ts`, which imports both `.wasm` files and their worker scripts with Vite's `?url`, then lets `duckdb.selectBundle` pick one at runtime.

Checked on 2026-09-25: jsDelivr serves `@duckdb/duckdb-wasm@1.32.0/dist/duckdb-eh.wasm` with:
- `access-control-allow-origin: *`
- `cross-origin-resource-policy: cross-origin` (so it still loads with our `require-corp` header, R3)
- `cache-control: public, max-age=31536000, immutable`
- Brotli-compressed: **6.8MB on the wire** instead of 34MB.

**Decision**: In production builds, load **only the two `.wasm` files** from jsDelivr, pinned to the exact installed `@duckdb/duckdb-wasm` version (read from `package.json` at build time, so upgrading the package moves the URL with it). Keep the worker scripts (~0.8MB each) self-hosted. That avoids the cross-origin `new Worker()` restriction, which would otherwise need a blob-URL wrapper. Dev and tests keep using the local files as today.

Add a build step that fails if any file in `dist/` is over 25 MiB, naming the file (spec edge case), so a future dependency can't break deploys silently.

**Security note**: jsDelivr becomes the app's first third-party network request. It only serves the engine binary. No save data is sent (the request carries no app data at all), and npm package versions on jsDelivr are immutable. The security constitution's sections 4 and 6 are updated to record this (FR-005). If jsDelivr is unreachable, loading a save fails with a clear "couldn't download the database engine" error. The start screen still works.

**Alternatives considered**:
- *Serve the `.wasm` from R2 storage*: no size limit and same origin via a custom domain, but it pulls 017's storage setup and a card-on-file into 016 for one file. Revisit in 017 if we want zero third-party requests.
- *Ship only the `eh` bundle*: still 34MB, over the limit.
- *Split the `.wasm` into chunks and reassemble in the browser*: works, but it's fragile custom code for a problem the CDN already solves.
- *Load the whole DuckDB bundle (workers too) from jsDelivr*: needs the blob-worker wrapper and adds more third-party code for no gain.

## R3. Cross-origin isolation headers

`vite.config.ts` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. `ARCHITECTURE.md` says they may not be needed. A search of `src/` and the Perspective and jomini packages found no `SharedArrayBuffer` use, which is the thing these headers unlock, so they are probably unnecessary.

**Decision**: Keep sending both headers in production through a `public/_headers` file. This matches the dev server exactly (a known-working setup), and jsDelivr's `cross-origin-resource-policy: cross-origin` header makes it compatible with R2. Removing them is a separate simplification that would need its own real-browser test. It isn't needed for hosting, so it stays out of scope (constitution VII).
**Alternative**: Drop the headers. Rejected for now: it saves nothing and risks a real-browser-only break.

## R4. Compression and caching

- Cloudflare compresses text files (JS, CSS, JSON, topojson) with Brotli/gzip automatically. The `.wasm` from jsDelivr arrives Brotli-compressed (R2).
- Vite's `dist/assets/*` filenames include a content hash, so they can be cached forever: `_headers` sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.
- `public/map/*`, `public/encyclopedia/*` and `public/tokens/*` have fixed names. They get Cloudflare's default (revalidate with an ETag), so a returning visitor gets a tiny "not modified" reply instead of the 15MB file. This meets SC-003 (under 1MB re-downloaded) without renaming anything.
- `index.html` must never be cached long, so a new deploy is picked up on the next load. That's Cloudflare's default. Because a returning visitor gets the new `index.html` plus the new hashed files together, there is no half-old, half-new app (spec edge case).

## R5. Pipeline shape (GitHub Actions)

Per Cloudflare's CI guide: `cloudflare/wrangler-action@v4` running `pages deploy dist --project-name=<name> --branch=<branch>`, with repository secrets `CLOUDFLARE_API_TOKEN` (permission: **Account → Cloudflare Pages → Edit**, nothing else) and `CLOUDFLARE_ACCOUNT_ID`.

**Decision**: One workflow, `.github/workflows/ci.yml`:
- **Trigger**: `push` to `main`, and `pull_request`.
- **Job `check`**: `npm ci` → `tsc -b` → `vitest run` → `vite build` → the 25 MiB size check → upload `dist/` as a build artifact. It runs for every trigger, forks included, with no secrets.
- **Job `deploy`**: needs `check`, downloads the artifact, and deploys. On `main` it deploys with `--branch=main`, which is production. On a PR it deploys with `--branch=<head branch>`, which is a preview, and then comments the preview URL on the PR. It only runs when the PR comes from this repo (`github.event.pull_request.head.repo.full_name == github.repository`), so fork code never runs with secrets (FR-010).
- **Permissions**: `contents: read` by default; `deploy` adds `deployments: write` and `pull-requests: write` (for the comment).
- **Concurrency**: one production deploy at a time (`concurrency: production`, no cancel), and a newer PR push cancels the older preview run.
- **Node**: pinned to Node 24 (the version the owner develops on, 24.8), using the `npm` cache.

The deploy uses the same `dist/` artifact the tests passed against. It is not rebuilt.

## R6. Rollback

Cloudflare Pages keeps every deployment. From the Pages project's Deployments list, "Rollback to this deployment" on the previous production deploy makes it live immediately, with no rebuild. This meets FR-013/SC-006. **Decision**: document it in the hosting runbook (see quickstart) and rehearse it once for real (SC-006). A CLI rollback isn't needed.

## R7. Test suite in CI (FR-011, SC-005)

- **Timeouts under load**: with the default 5s timeout, DuckDB-heavy tests time out on a busy machine (memory note, 2026-09-25). GitHub's hosted runners are small (2–4 cores). **Decision**: set `testTimeout`/`hookTimeout` to 60s in `vitest.config.ts` for everyone, which matches the rerun command already used locally, and run with `--maxWorkers=2` in CI.
- **`RulerHistoryChart.test.tsx` flake** (about 1 run in 3, even alone). *Outcome, found during implementation: there were two causes. Spy call history leaked between tests, and there was an empty-history first render that the tooltip test's wait didn't exclude. See the tasks.md implementation notes.* Original hypothesis: a race. Several tests wait until `loadRulerHistory` *has been called*, then immediately read the chart's *latest* props, but the re-render with the loaded data may not have happened yet. **Decision**: fix the root cause by waiting on the props assertion itself, then prove it with 30 consecutive solo runs. Only if a real cause can't be found, mark that one test with `retry: 2` and a comment saying why. Never retry the whole suite.
- Tests that need the local game install or real saves already skip when the files are missing (`existsSync` guards), so CI runs the fixture-based suite.
- **Baseline**: see the note at the end of this file.

## R8. Build-time app version (FR-007)

**Decision**: Vite `define` injects `__APP_VERSION__` = the short commit SHA. It comes from `GITHUB_SHA` in CI, or `git rev-parse --short HEAD` locally, falling back to `"dev"`. It's shown in the app's footer or header area, small and muted, next to the new "unofficial fan tool" notice (FR-016).

## R9. Unsupported browser check (FR-008)

The app needs WebAssembly, Web Workers and the Origin Private File System (`navigator.storage.getDirectory`). Private browsing in Firefox and Safari blocks the last one. **Decision**: a small startup check. If any of these is missing, show a plain message naming what's missing and suggesting a normal window in an up-to-date Chrome, Firefox or Safari, instead of the loader. The check doesn't load DuckDB, so it's instant.

## R10. What the site redistributes (FR-016)

`public/` ships: `map/` (traced geometry, allowed by the asset stance), `encyclopedia/` (allowed by the constitution's Encyclopedia-data exception), `tokens/eu5.flat` (pdx.tools permission, recorded in 015's spec). `src/parser/melter/generated/` is our own MIT-derived WASM build. **Decision**: a task audits `dist/` for image or texture files (`.png .dds .tga .jpg .webp`) and fails the build if any appear. The owner confirms the pdx.tools permission covers public serving before the first public deploy. This is a manual gate in the quickstart; the pipeline can't check it.

## Baseline test run (2026-09-25, owner's Mac, load average ~11)

`npx tsc -b` passed in about 1s. `npx vitest run --maxWorkers=2` (default 5s timeouts): **83 files, 486 tests, all passed in 2m 0s** (tests are 63% of that, jsdom setup 27%). The flaky test happened to pass this time.

What this means for CI:
- A two-worker run fits easily inside the 15-minute push-to-live target (SC-004).
- Tests that need the game install skip cleanly on a machine that doesn't have it.
- jsdom prints harmless "canvas getContext not implemented" warnings; these are not failures.
- vitest suggests `pool: 'vmThreads'` to speed up jsdom setup. That's optional and not needed to meet any target, so it's deferred.
