# Quickstart: Validating Save Import & Overview

This is the manual validation guide for this feature — how to confirm it
actually works end-to-end once implemented. It intentionally doesn't
contain implementation code; see `tasks.md` (from `/speckit-tasks`) for
that.

## Prerequisites

- Node.js LTS installed.
- `npm install` run at the repo root.
- At least one real (or minimized, per constitution Principle II) EU5 save
  file available locally, placed under `tests/fixtures/` for automated
  tests, and a separate real save on hand for manual verification.
- A supported browser (current Chrome or Edge recommended first, given the
  OPFS support noted as a risk in `research.md`).

## Running it locally

```bash
npm run dev
```

Open the printed local URL in a supported browser.

## Validation scenarios

Each scenario maps to an acceptance scenario in `spec.md`.

1. **Happy path (User Story 1 + 2)**: Select a valid, supported save file.
   Expect: progress feedback appears within ~1s (FR-008), and within 60s
   (SC-001) the overview renders with nation name, in-game date, total
   development, province count, treasury, stability, government type, and
   war status. Total development and province count must be visually
   marked as derived (FR-007); the rest must not be.
2. **Replace a loaded save (FR-010)**: With a save already loaded, select a
   different valid save. Expect: the overview updates to the new save;
   nothing from the previous save remains visible or queryable.
3. **Not a save file (User Story 3)**: Select an arbitrary non-save file
   (e.g., a `.txt`). Expect: a clear "not a recognized EU5 save" message,
   no crash.
4. **Unsupported version (User Story 3)**: Select a save from a game
   version with no adapter. Expect: a clear "unsupported version" message
   naming the detected version; no overview is rendered.
5. **Corrupted save (User Story 3)**: Select a truncated/corrupted save
   file. Expect: a clear "failed to parse" message, no partial or blank
   overview.
6. **Keep a save (User Story 4)**: Load a save, choose "keep," then reload
   the page (simulating a new session). Expect: the app offers to resume
   the kept save without re-uploading, and its overview matches what was
   shown before reloading.
7. **Forget a kept save (User Story 4)**: With a save kept per scenario 6,
   explicitly clear/forget it, then reload the page. Expect: no kept save
   is offered; a fresh upload is required.
8. **Cancel mid-parse (Edge Case)**: While a large save is parsing, select
   a different file before it finishes. Expect: the first parse is
   cancelled cleanly (per the worker `cancel` message in
   `contracts/worker-protocol.md`); only the second file's result appears.

## Out of scope for this quickstart

Automated fixture-based parser tests (Vitest) are the primary correctness
check for the parser itself, per constitution Principle II — this
quickstart is for end-to-end/manual confirmation, not a substitute for
those tests.
