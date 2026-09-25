# Implementation Plan: Public Hosting & Deployment Pipeline

**Branch**: `016-public-hosting-pipeline` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-public-hosting-pipeline/spec.md`

## Summary

Publish the existing client-only app to Cloudflare Pages on `*.pages.dev`, and deploy it from a GitHub Actions pipeline:
- Every push and pull request runs the type check, tests and build.
- Pushes to `main` deploy to production.
- Pull requests from this repo get a preview address posted on them.

The app itself barely changes. The one real obstacle is that the two DuckDB engine files (34MB and 39MB) are over Pages' 25 MiB per-file limit. Production builds load just those two `.wasm` files from jsDelivr, pinned to the installed package version. jsDelivr was checked to send the CORS and cross-origin-resource-policy headers our isolation headers need, and it serves them Brotli-compressed at about 7MB. Everything else stays self-hosted.

A `_headers` file brings the dev server's cross-origin isolation headers and long-lived caching for hashed files to production.

Small app additions:
- the deployed version shown in the UI
- an "unofficial fan tool" notice
- an unsupported-browser message

The pipeline is made trustworthy by raising test timeouts and fixing the root cause of the known-flaky `RulerHistoryChart` test.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 24 in CI (owner develops on 24.8); GitHub Actions workflow YAML

**Primary Dependencies**: existing Vite, React 19, DuckDB-Wasm 1.32.0. New, CI-only: `cloudflare/wrangler-action@v4`, `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`/`download-artifact`. No new npm runtime dependency.

**Storage**: Unchanged. DuckDB-Wasm on OPFS, per browser origin. The production origin and each preview origin keep separate kept saves, which is expected.

**Testing**: vitest (+ jsdom) as today, with 60s test/hook timeouts. A build-output check script (per-file size limit, no image/texture assets). Real-browser verification on the deployed site per [quickstart.md](./quickstart.md).

**Target Platform**: Latest desktop Chrome, Firefox and Safari; Cloudflare Pages static hosting; GitHub-hosted Ubuntu runners

**Project Type**: Client-only web application plus a CI/CD pipeline

**Performance Goals**: Start screen within 5s on first visit at 50 Mbps (SC-001); under 1MB re-downloaded on a return visit with no new deploy (SC-003); push-to-live within 15 minutes (SC-004)

**Constraints**:
- no file over 25 MiB in `dist/`
- no save data leaves the device; jsDelivr is the only third-party request, and it only serves the engine binary
- no secrets in the repo or logs; fork pull requests never see secrets
- $0/month

**Scale/Scope**: About 1 workflow file, 1 `_headers` file, 1 build-check script, small edits to `src/storage/db.ts`, `vite.config.ts`, `vitest.config.ts`, the app shell (version, notice, browser check), one test fix, and docs (README, ARCHITECTURE, security constitution, hosting runbook).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Read-only, client-side save handling | ✅ | Hosting only serves static files. Parsing stays in the visitor's browser. No server receives saves; no analytics or telemetry is added. SC-007 checks this in the network panel. |
| II. Parser test-first fixtures | ✅ N/A | No parser change. CI now enforces the existing fixture tests on every push. |
| III. Explicit version compatibility | ✅ N/A | Unchanged. |
| IV. Accurate representation | ✅ N/A | No data shown differently. |
| V. Performance / progress feedback | ✅ | The engine download is Brotli-compressed (~7MB instead of 34MB) and immutably cached. The existing load progress covers it; a failed engine download shows a clear error, not a stall. |
| VI. Accessibility | ✅ | The new version label, notice and unsupported-browser message are plain text meeting the app's contrast tokens. |
| VII. Simplicity | ✅ | Static hosting, one workflow file, no backend. Removing the isolation headers and self-hosting the engine via R2 are explicitly deferred (research R2, R3). |
| VIII. Grounded AI agent | ✅ N/A | Not touched. |
| Tech constraint: no Paradox art shipped | ✅ | The build check fails on image/texture files in `dist/` (research R10). The shipped derived data is already covered by the constitution and 015's permission record. The owner re-confirms pdx.tools permission for public serving before the first deploy. |
| Tech constraint: server-side retention | ✅ N/A | No server-side component. |
| Security constitution §4 Secrets | ⚠️ → ✅ | It says "Not applicable" today. The pipeline adds two GitHub secrets, so §4 is updated to describe them, their scope (Pages: Edit only) and rotation. |
| Security constitution §6 External calls | ⚠️ → ✅ | It says "zero outbound network requests". jsDelivr becomes one for the engine binary, so §6 is updated to record it, why, and that it carries no app data. |

No unjustified violations. The two ⚠️ rows are documentation that has to change because the facts change, and the plan includes those edits. **Post-design re-check (after Phase 1)**: unchanged; the contracts introduce nothing beyond the rows above.

## Project Structure

### Documentation (this feature)

```text
specs/016-public-hosting-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0: host limits, engine CDN, headers, caching, pipeline, flake
├── data-model.md        # Phase 1: deployment / pipeline run / credential
├── quickstart.md        # Phase 1: one-time setup runbook + validation scenarios
├── contracts/
│   ├── pipeline.md          # workflow triggers, jobs, secrets, permissions
│   ├── hosting-headers.md   # _headers rules and caching behavior
│   └── engine-loading.md    # how db.ts picks local vs CDN engine files
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci.yml                  # NEW: check → deploy (production on main, previews on PRs)

public/
└── _headers                    # NEW: isolation headers + immutable caching for /assets/*

tools/
└── check-dist/
    └── check-dist.ts           # NEW: fail on any dist file > 25 MiB or any image/texture asset

src/
├── storage/db.ts               # CHANGED: production build takes .wasm URLs from jsDelivr (pinned version)
├── app.tsx                     # CHANGED: startup browser check, version label, fan-tool notice
└── vite-env.d.ts               # CHANGED: declare __APP_VERSION__ / engine constants

vite.config.ts                  # CHANGED: define __APP_VERSION__ and the pinned DuckDB version
vitest.config.ts                # CHANGED: 60s test/hook timeouts
package.json                    # CHANGED: "check:dist" script
tests/components/RulerHistoryChart.test.tsx   # CHANGED: fix the render race (research R7)
tests/storage/engine-urls.test.ts             # NEW: engine URL selection per build mode
tests/tools/check-dist.test.ts                # NEW: size/asset check behavior

Dockerfile                      # CHANGED: comment only — hosting is Pages, Docker stays dev-only
README.md                       # CHANGED: public address, how deploys work
ARCHITECTURE.md                 # CHANGED: hosting section, engine-from-CDN, headers
.specify/memory/security_constitution.md      # CHANGED: §4 secrets, §6 jsDelivr
docs/hosting.md                 # NEW: setup-from-scratch + rollback runbook (FR-013, FR-015)
```

**Structure Decision**: Single client-only project as today. The only new top-level directories are `.github/` (the pipeline) and `docs/` (the runbook, which the owner reads outside the spec folder). `tools/check-dist/` sits alongside the existing `tools/*` generators.

## Complexity Tracking

No constitution violations to justify.
