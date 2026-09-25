# Data Model: Public Hosting & Deployment Pipeline (016)

This feature adds no app data and no database schema. The "entities" are deployment objects that live in GitHub and Cloudflare. They're listed here so the contracts and runbook use the same names.

## Deployment

One upload of a built `dist/` to the Pages project.

| Field | Meaning |
|---|---|
| environment | `production` (branch `main`) or `preview` (any other branch) |
| branch | Git branch the build came from |
| commit | Full commit SHA; the short form is shown in the app as `__APP_VERSION__` |
| url | Production: `https://<project>.pages.dev`. Preview: `https://<branch-alias>.<project>.pages.dev` |
| status | `active` (currently served for its environment), `superseded`, or `rolled-back-to` |

**Rules**
- There is exactly one active production deployment.
- A production deployment is only created from a pipeline run whose `check` job passed (FR-009).
- Deployments are never deleted by the pipeline, which is what makes rollback possible (FR-013).

**State transitions (production)**: `new → active`, and the previous one becomes `superseded`. For a rollback, a `superseded` deployment becomes `active` again and the bad one becomes `superseded`.

## Pipeline run

One GitHub Actions run of `ci.yml`.

| Field | Meaning |
|---|---|
| trigger | `push` to `main`, or `pull_request` (opened, synchronized or reopened) |
| source | `same-repo` or `fork` (fork runs never get secrets or a deploy) |
| steps | install → typecheck → test → build → check-dist → [deploy] → [PR comment] |
| result | Pass/fail per step. The first failed step is what GitHub shows (FR-012). |
| artifact | The `dist/` that passed the checks; the deploy job uses exactly this, it is not rebuilt |

## Deploy credential

| Name | Where it lives | Scope |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub repository secret | Account → Cloudflare Pages → Edit, on this account only |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secret (not sensitive, but kept alongside the token) | n/a |
| `GITHUB_TOKEN` | Provided automatically per run | `contents: read`; the deploy job adds `deployments: write` and `pull-requests: write` |

**Rules**: never committed, never echoed, never available to fork runs. Rotation (revoke, create a new one, update the secret) is documented in `docs/hosting.md`.
