# Hosting runbook

NauticalBeg is static files on **Cloudflare Pages**, deployed by **GitHub
Actions** (`.github/workflows/ci.yml`). There is no server and no database
to look after. This page covers setting it up from scratch, how deploys
work, rolling back, and rotating the deploy token.

Design background: `specs/016-public-hosting-pipeline/` and the "Public
hosting (016)" section of `ARCHITECTURE.md`.

> Never paste the API token into chat, an issue, a commit or a log.

## One-time setup

1. **Cloudflare account**: sign up free at <https://dash.cloudflare.com>.
   No card is needed for Pages.
2. **Create the Pages project** (Direct Upload):
   - Workers & Pages → Create → switch to the **Pages** tab → **Upload assets**.
     Careful: the Create flow defaults to **Workers**. A Worker named
     `nauticalbeg` makes the deploy fail with "The Pages project does not
     exist". Check that the dashboard URL contains `/pages/view/`, not `/workers/`.
   - Name it `nauticalbeg`. If that name is taken, note the name Cloudflare
     gives you and put it in `PAGES_PROJECT` at the top of
     `.github/workflows/ci.yml`, and in the address in `README.md`.
   - Production branch: `main`.
   - If it asks for files before it creates the project, upload any
     throwaway folder. The pipeline's first run replaces it.
3. **Create the API token**: My Profile → API Tokens → Create Token →
   **Create Custom Token**.
   - Permissions: **Account → Cloudflare Pages → Edit**. Nothing else.
   - Account Resources: include only your account.
   - Copy the token once; Cloudflare won't show it again.
4. **Find the account ID**: it's on the Workers & Pages overview page (right
   sidebar), or in the dashboard URL after `dash.cloudflare.com/`.
5. **Add GitHub secrets**: repository → Settings → Secrets and variables →
   Actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN`: the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID`: the ID from step 4
6. **Deploy**: push to `main` (or re-run the latest CI run). The site goes
   live at `https://<project>.pages.dev`.

## How deploys work

| Event | Checks | Deploy |
|---|---|---|
| Push to `main` | type check, tests, build, `check:dist` | production, if every check passes |
| Pull request from this repo | same | preview at its own address, commented on the PR |
| Pull request from a fork | same | none (fork code never gets the secrets) |

- The deploy uploads the exact `dist/` the checks ran against. It is never
  rebuilt.
- If any check fails, nothing is deployed and the site stays on the last
  good version. The failing step is shown in the Actions tab.
- The version label in the app footer (`v` + short commit SHA) tells you
  which commit is live.

## Rolling back a bad deploy

Takes about a minute, with no rebuild:

1. Cloudflare dashboard → Workers & Pages → the `nauticalbeg` project →
   **Deployments**.
2. Find the last good **Production** deployment (match the commit SHA to
   the version label).
3. Its `…` menu → **Rollback to this deployment** → confirm.
4. Reload the site and check that the footer version changed.

Then fix the problem on `main` as usual. The next successful push deploys
over the rollback.

## Rotating the deploy token

Do this right away if the token may have leaked, and otherwise whenever
you like:

1. Create a new token exactly as in setup step 3.
2. Update the `CLOUDFLARE_API_TOKEN` secret in GitHub with the new value.
3. Re-run the latest CI run on `main` and confirm the deploy step passes.
4. In Cloudflare, My Profile → API Tokens → the old token → **Delete**.

## When the deploy step fails

- **Authentication error / 403**: the token is missing, expired, deleted
  or lacks "Cloudflare Pages: Edit". Rotate it (above).
- **Project not found**: `PAGES_PROJECT` in `ci.yml` doesn't match the
  project's name in Cloudflare.
- **A file is over 25 MiB**: `check:dist` should have caught this before
  the deploy step. It names the file. Keep large files off the site, as
  the DuckDB engine already is (it loads from jsDelivr in production).
- The checks still report on their own when the deploy fails, so a red
  deploy step doesn't mean the code is broken.
