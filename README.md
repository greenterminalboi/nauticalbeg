# NauticalBeg

A web-based save-file analysis and visualization tool for Europa
Universalis V (EU5). Load your exported save and see your game state
through interactive visualizations that go beyond EU5's built-in UI.

Everything runs client-side in your browser — your save file never leaves
your machine unless you explicitly choose to keep it in local browser
storage.

## Use it online

NauticalBeg is hosted at **https://nauticalbeg.pages.dev** (the address is
confirmed once the Cloudflare Pages project exists — see `docs/hosting.md`).
Nothing to install; your save is still read entirely in your browser.

NauticalBeg is an unofficial fan tool, not affiliated with Paradox
Interactive.

## Sharing a game

Once a save is loaded, **Share** uploads the analysed game data (never the
save file) and gives you a link anyone can open for 7 days. What's stored,
for how long and why: `docs/sharing.md`.

## Requirements

- Node.js LTS
- A modern Chromium-based browser (Chrome/Edge) is recommended for now —
  the local storage layer depends on OPFS + WebAssembly support that is
  more mature there than in some other browsers (see `ARCHITECTURE.md`).

## Running locally

```bash
npm install
npm run dev
```

Then open the printed local URL.

## Running with Docker

```bash
docker compose up
```

Then open `http://localhost:5173`.

## Testing

```bash
npm test
```

## How it's deployed

Every push to `main` runs the type check, tests and a production build in
GitHub Actions. If they all pass, that exact build goes live on Cloudflare
Pages. Pull requests get the same checks plus a preview address posted on
the PR. Setup from scratch, rolling back a bad deploy, and rotating the
deploy token are in `docs/hosting.md`. Local development is unchanged
(`npm run dev`).

## Project docs

- `ARCHITECTURE.md` — module boundaries, data flow, key technical decisions
- `docs/hosting.md` — hosting setup, deploys, rollback, token rotation
- `docs/sharing.md` — what sharing stores, for how long, and its setup
- `specs/001-save-import-overview/spec.md` — feature specification
- `specs/001-save-import-overview/plan.md` — implementation plan
- `specs/001-save-import-overview/quickstart.md` — manual validation scenarios
- `.specify/memory/constitution.md` — project principles and governance
