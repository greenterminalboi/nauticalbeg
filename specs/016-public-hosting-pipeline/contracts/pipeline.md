# Contract: CI/CD pipeline (`.github/workflows/ci.yml`)

## Triggers

| Event | Runs `check` | Runs `deploy` | Deploy target |
|---|---|---|---|
| `push` to `main` | yes | yes, if `check` passed | production (`--branch=main`) |
| `pull_request` from this repo | yes | yes, if `check` passed | preview (`--branch=<head ref>`) + PR comment with the URL |
| `pull_request` from a fork | yes | **no** | none |
| `push` to any other branch | no (covered by its PR) | no | none |

## Job `check` (no secrets)

1. `actions/checkout`
2. `actions/setup-node` with Node 24 and the npm cache
3. `npm ci`
4. `npx tsc -b`: type errors fail the run
5. `npx vitest run --maxWorkers=2`: any failure fails the run (60s timeouts come from `vitest.config.ts`)
6. `npx vite build`, with `GITHUB_SHA` available so `__APP_VERSION__` is the commit
7. `npm run check:dist`: fails on any file over 25 MiB (26,214,400 bytes) or any `.png/.jpg/.jpeg/.webp/.dds/.tga` in `dist/`, naming each offender
8. Upload `dist/` as artifact `site`

## Job `deploy`

- `needs: check`
- Runs when: `github.event_name == 'push'`, or `github.event.pull_request.head.repo.full_name == github.repository`
- Permissions: `contents: read`, `deployments: write`, `pull-requests: write`
- Download artifact `site`, then `cloudflare/wrangler-action@v4` with `apiToken: secrets.CLOUDFLARE_API_TOKEN`, `accountId: secrets.CLOUDFLARE_ACCOUNT_ID`, command `pages deploy dist --project-name=<PAGES_PROJECT> --branch=<branch>`
- On PRs: post or update a single comment on the PR with the action's `deployment-url` output. Update the same comment on later pushes, don't add a new one each time.

## Concurrency

- Production: `group: deploy-production`, `cancel-in-progress: false`, so deploys run in order and are never cut off halfway.
- PRs: `group: pr-${{ github.event.pull_request.number }}`, `cancel-in-progress: true`, so the latest push wins.

## Configuration

- `PAGES_PROJECT` is a workflow-level `env` value set to the project name created in the runbook. It's not a secret.
- If the secrets are missing, `deploy` fails at the wrangler step with its auth error, and `check` still reports independently (spec edge case).
