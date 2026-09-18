# NauticalBeg

A web-based save-file analysis and visualization tool for Europa
Universalis V (EU5). Load your exported save and see your game state
through interactive visualizations that go beyond EU5's built-in UI.

Everything runs client-side in your browser — your save file never leaves
your machine unless you explicitly choose to keep it in local browser
storage.

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

## Project docs

- `ARCHITECTURE.md` — module boundaries, data flow, key technical decisions
- `specs/001-save-import-overview/spec.md` — feature specification
- `specs/001-save-import-overview/plan.md` — implementation plan
- `specs/001-save-import-overview/quickstart.md` — manual validation scenarios
- `.specify/memory/constitution.md` — project principles and governance
