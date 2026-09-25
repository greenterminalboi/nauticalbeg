# Quickstart: Public Hosting & Deployment Pipeline (016)

Two parts: a one-time setup the project owner does (it needs their accounts), then validation scenarios that prove the feature works. The finished setup steps also go into `docs/hosting.md` (FR-015). This file is the checklist for the feature.

## Part A: One-time setup (project owner)

Never paste the API token into chat or commit it.

1. **Cloudflare account**: sign up free at dash.cloudflare.com. No card is needed for Pages.
2. **Create the Pages project** (Direct Upload): Workers & Pages → Create → Pages → "Upload assets". Name it `nauticalbeg` and set the production branch to `main`. If the name is taken, note the name Cloudflare assigns. It goes into `PAGES_PROJECT` in `ci.yml` and into the README.
3. **API token**: My Profile → API Tokens → Create Token → Custom. Permission **Account → Cloudflare Pages → Edit**, restricted to your account. Nothing else.
4. **Account ID**: shown on the Workers & Pages overview page.
5. **GitHub secrets**: repo → Settings → Secrets and variables → Actions → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
6. **Permission gate**: confirm that the pdx.tools permission covers serving `tokens/eu5.flat` from a public site (research R10). Don't do the first production deploy until this is confirmed.

## Part B: Local validation (before any deploy)

| # | Run | Expect |
|---|---|---|
| B1 | `npm run build && npm run check:dist` | Passes. No `duckdb-*.wasm` in `dist/assets/`. No file over 25 MiB. `dist/_headers` exists. |
| B2 | Temporarily copy a 30MB file into `public/`, then rebuild and check | `check:dist` fails and names that file. Remove the file afterwards. |
| B3 | `npx vite preview`, open it in Chrome, load `MP_RUS_1657_01_03_….eu5` | Loads. The network panel shows the `.wasm` coming from `cdn.jsdelivr.net` with the version pinned. Response headers include both isolation headers. Note: `vite preview` doesn't apply `_headers`, so check the headers on the real deploy in C2. |
| B4 | `for i in $(seq 30); do npx vitest run tests/components/RulerHistoryChart.test.tsx || break; done` | 30 out of 30 pass (research R7). |
| B5 | `npx vitest run --maxWorkers=2` | All pass. |

## Part C: Hosted validation

| # | Scenario | Expect | Spec |
|---|---|---|---|
| C1 | Push to `main` with checks passing | Within 15 minutes, `https://<project>.pages.dev` serves the new commit, and the app's version label shows its short SHA | US2, SC-004, FR-007 |
| C2 | Open the public address in a fresh Chrome profile. Check response headers and timing. | Start screen within 5s at around 50 Mbps. `index.html` has both isolation headers. `/assets/*` has `immutable`. Fan-tool notice is visible. | US1, SC-001, FR-004, FR-016 |
| C3 | Load `MP_RUS_1657` on the hosted site in Chrome, Firefox and Safari | Same in-game date, player nation and Overview headline figures as the local build. Every tab and map mode shows data. | SC-002, FR-002 |
| C4 | During C3, filter the network panel to everything except the site's own origin, jsDelivr and Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`, pre-existing since 001, an open decision) | Nothing else. No request body contains save data. | SC-007, FR-003 |
| C5 | Reload the site after C3 with no new deploy | Under 1MB transferred before the start screen (the rest is from cache or "not modified") | SC-003 |
| C6 | Keep a save, close the tab, reopen the address | The kept save can be resumed | US1 #5 |
| C7 | Open a Firefox private window on the site | A plain unsupported-browser message naming the missing storage, not a blank page | FR-008 |
| C8 | Open a PR with a visible change | Checks pass, a preview URL is commented on the PR, the preview shows the change, and production doesn't | US3 |
| C9 | Push a commit to the PR that breaks a test | `check` fails and names the test. No deploy. Production unchanged. | FR-012 |
| C10 | Rollback rehearsal: in the Pages dashboard, roll back to the previous production deployment, then forward again. Time it. | Under 5 minutes, no rebuild | SC-006, FR-013 |
| C11 | Count the next 10 pipeline runs | Zero failures from flaky tests | SC-005 |
| C12 | Check the Cloudflare billing page after a week | $0 | SC-008 |
