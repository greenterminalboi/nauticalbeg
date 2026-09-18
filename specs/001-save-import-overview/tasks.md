---

description: "Task list for Save Import & Overview"
---

# Tasks: Save Import & Overview

**Input**: Design documents from `/specs/001-save-import-overview/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not requested generally, but constitution Principle II makes
fixture-based parser tests NON-NEGOTIABLE — every task that adds or changes
parsing logic includes a fixture test written first. Other layers only get
tests where they materially reduce risk (storage persistence logic,
derived-value correctness).

**Organization**: Tasks are grouped by user story (spec.md priorities
P1–P4) so each can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Paths are relative to the repository root (single-project layout per plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repo, tooling, and containerization — nothing feature-specific yet.

- [x] T001 Initialize git repository at the repository root and set the default branch to `main` (done)
- [x] T002 Create project scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`, React + TypeScript entry points `src/main.tsx` and `src/app.tsx`, per plan.md Project Structure (React 19 installed — newer than plan.md's "React 18" note; no architectural impact)
- [x] T003 [P] Configure Vitest (`vitest.config.ts`) and React Testing Library for component tests
- [x] T004 [P] Add `.gitignore` at the repository root covering `node_modules/`, `dist/`, `.vite/`, and any local OPFS/test-artifact directories (`.dockerignore` also added alongside, matching T005/T006)
- [x] T005 [P] Create `Dockerfile` at the repository root: Node LTS base image, installs dependencies, runs the Vite dev server, exposing the dev port for local containerized development
- [x] T006 [P] Create `docker-compose.yml` at the repository root that builds the `Dockerfile` and mounts the source tree, so `docker compose up` runs the dev server with live reload
- [x] T007 [P] Create `ARCHITECTURE.md` at the repository root: summarize the module boundaries (`parser/`, `storage/`, `domain/`, `components/`), the worker message contract, and the data model, derived from plan.md, data-model.md, and contracts/ — this is a living document, updated whenever the as-built design diverges from it (see T040)
- [x] T008 [P] Add root `README.md` with setup instructions (local and via Docker) referencing quickstart.md

**Checkpoint**: Repo is initialized, containerized dev environment works, architecture guide exists (even if minimal) before any feature code is written.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared structure and the storage/worker skeletons every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 Create the source layout per plan.md: `src/parser/`, `src/parser/version-adapters/`, `src/storage/`, `src/domain/`, `src/components/`, `tests/fixtures/`, `tests/parser/`, `tests/storage/`, `tests/components/`
- [x] T010 Add the `wa-sqlite` dependency and implement `src/storage/db.ts`: open/create a per-save SQLite database backed by the OPFS VFS (research.md §2) — WASM bundling smoke-tested via a temporary import + `vite build` (produced a real `.wasm` asset); COOP/COEP headers added to `vite.config.ts` per the OPFS/SharedArrayBuffer requirement discovered during this task (now documented in ARCHITECTURE.md)
- [x] T011 Create `src/storage/schema.sql` implementing the `save_meta`, `nations`, `provinces`, `locations`, and `war_participants` tables from data-model.md (schema corrected after real-save research — see research-save-format.md; `owner_idx`/`nation_idx` are nullable/FK as noted there, `save_meta.kept` defaults to `0`)
- [x] T012 [P] Create `src/storage/queries.ts` with the exact function signatures from contracts/data-access-contract.md (`getSaveMeta`, `getPlayerNationOverview`, `keepSave`, `forgetKeptSave`, `listKeptSave`) — stub implementations are acceptable here; US1–US4 fill in real logic
- [x] T013 Create `src/parser/worker.ts` implementing the message contract from contracts/worker-protocol.md (`load`/`cancel` in; `progress`/`error`/`ready` out) with no real parsing logic yet — just the message plumbing (every `load` currently ends in a placeholder "not implemented" error, preserving the "exactly one terminal message" contract rule)
- [x] T014 [P] Acquire at least one real (or minimized, per constitution Principle II) EU5 save file and commit it under `tests/fixtures/` — this is a hard prerequisite for T016 and all real parser work; if no real save is available yet, this task blocks Phase 3 and must be resolved first — **DONE**: `tests/fixtures/rus-1628-minimal.eu5` (4.2KB), hand-assembled from real field names/values found in a genuine 653MB save (version 1.3.11); see `research-save-format.md` for the full field reference and exactly how the fixture was derived (not a raw byte slice — see that doc's "Fixture composition method" section for why and how)

**Checkpoint**: Foundation ready — storage layer, worker skeleton, and at least one real fixture exist. User Story 1 can now begin.

---

## Phase 3: User Story 1 - Load a save file (Priority: P1) 🎯 MVP

**Goal**: A player selects a valid, supported EU5 save file and the tool
parses it, confirming success by identifying at minimum the player's
nation and the save's in-game date (spec.md User Story 1).

**Independent Test**: Select a valid, supported EU5 save file and confirm
the tool acknowledges it loaded, showing the player's nation name and
in-game date — no overview stats or error handling required yet.

### Tests for User Story 1 (required by constitution Principle II — parser logic is NON-NEGOTIABLE test-first)

- [x] T015 [P] [US1] Write a fixture-based test in `tests/parser/version-detect.test.ts` asserting `version-detect.ts` correctly identifies the game version of the fixture from T014 — write this before T017 exists, per Principle II
- [x] T016 [P] [US1] Write a fixture-based regression test in `tests/parser/adapter.test.ts` asserting the first version adapter parses the T014 fixture into the exact `save_meta`/`nations`/`provinces`/`locations`/`war_participants` rows expected (NOTE: schema corrected against the real fixture — see `research-save-format.md` and the updated `data-model.md`/`schema.sql`; countries/provinces are numeric-index-keyed via a `countries.tags` lookup, not tag-keyed, and `locations` is a new table development actually lives on) — write this before T018 exists, per Principle II — grown to **10 tests in this file (27/27 total in the suite)** as the adapter evolved, all passing, run against a real in-memory SQLite VFS (see `tests/helpers/sqlite-test-env.ts` — Node has no OPFS, so `src/storage/db.ts` gained a `configureSQLiteForTesting` seam to swap VFS/module-config in tests)

### Implementation for User Story 1

- [x] T017 [US1] Implement `src/parser/version-detect.ts` to satisfy T015 — version string is at `metadata.version` (confirmed real path, e.g. `"1.3.11"`, per research-save-format.md). **Superseded approach**: originally built on a hand-rolled `src/parser/clausewitz.ts` tokenizer; later migrated to [`jomini`](https://www.npmjs.com/package/jomini) (MIT, WASM) after discovering it via a comparison against an existing open-source Paradox save-parsing toolkit — see `research-save-format.md`'s "Save format parsing: switched to `jomini`" and `ARCHITECTURE.md`. `clausewitz.ts` was deleted; `jomini` handles the real-save quirks it needed hand-patching for (a literal `"=="` key, an object used as a map key) natively
- [x] T018 [US1] Implement the first entry under `src/parser/version-adapters/` (named for the detected version) to satisfy T016 — covers FR-002 (format validation) and FR-003 (parse into the structured representation). Must populate `nations` (via `countries.tags` + `countries.database`, filtering `country_type="Real"`), `provinces` (via `provinces.database`), `locations` (via `locations.locations`, including `development`), and `war_participants` (via `war_manager.database[*].all[*]`) per the corrected data-model.md — NOT the original flat tag-keyed assumption. Done: `src/parser/version-adapters/1.3.11.ts`, now built on `jomini` (see T017's note) rather than the original hand-rolled tokenizer. Parses **every** top-level section (per explicit project direction), not just the 5 this feature needs — anything without a real table (~45 sections) is captured as opaque JSON in `raw_sections` (see data-model.md) so future features (map, time-series, AI copilot) don't lose data. `played_country` comes after `countries` in real file order, so `nations.is_player`/`name` are set via a follow-up `UPDATE` once the player's index is known. **Verified against the complete real 653MB save** (not just the fixture): parses successfully end-to-end in ~17 seconds — covered by test, 27/27 passing
- [x] T019 [P] [US1] Implement `src/parser/save-reader.ts` for streaming file access via `File.slice()` (research.md §3), with a unit test in `tests/parser/save-reader.test.ts`. **Updated after the jomini migration**: reads raw bytes (`Uint8Array`) rather than decoding to text — `jomini` parses bytes directly, and decoding a 653MB file to one JS string hits V8's string-length ceiling in Node (confirmed directly), which bytes avoid entirely. `.slice()` was already used over `.stream()` since jsdom's `File` polyfill doesn't implement `.stream()`. 4/4 tests passing
- [x] T020 [US1] Wire `src/parser/worker.ts` to use `version-detect.ts` + the T018 adapter + `save-reader.ts`: post `progress` messages at least once per second (FR-008) and insert parsed rows into the SQLite database as parsing proceeds (depends on T017–T019). Implemented as `src/parser/load-save.ts` (the real orchestration, unit-testable directly — see `tests/parser/load-save.test.ts`, 5/5 passing) with `worker.ts` reduced to thin `postMessage` glue around it, since a real Worker thread isn't practically unit-testable
- [x] T021 [US1] Implement the FR-004 unsupported-version path in `src/parser/worker.ts`: when no adapter matches the detected version, send `error` with `kind: "unsupported-version"` and the detected version string, without attempting to parse further — done in `load-save.ts`, covered by test
- [x] T022 [US1] Implement FR-010 in `src/parser/worker.ts`: handle a `cancel` message by aborting any in-progress parse cleanly, so a newly started `load` is unaffected by the previous one — done via `AbortController`/`AbortSignal` threaded through `load-save.ts` and `save-reader.ts`; a cancelled load calls neither `onReady` nor `onError` (looks like it never happened, not like a reported failure). **Known gap, not yet fixed**: cancellation is checked during file-reading and between phases, but not mid-way through the parse/insert loop itself (parsing a fixture-sized file is fast enough not to matter yet; would need threading the signal into `scanTopLevelSections` for a real ~600MB file)
- [x] T023 [US1] Create `src/components/Overview/FileLoader.tsx`: a file-picker that posts `load` to the worker and renders progress/ready/error states from the contract
- [x] T024 [US1] Wire `FileLoader`'s `ready` handling to call `getSaveMeta`/`getPlayerNationOverview` (`src/storage/queries.ts`) and display at minimum the player nation's name and in-game date, satisfying the Independent Test above — implemented `getSaveMeta`/`getPlayerNationOverview` for real in `queries.ts` (previously stubs), using a new `queryRows` helper in `db.ts` (wa-sqlite's `execWithParams`); covered by `tests/storage/queries.test.ts` (3/3) against the real fixture, including the full US2 aggregate/derived-flag logic (pulled forward from T026 since it was the same SQL either way — see T026's note)
- [x] T025 [US1] Wire `src/app.tsx` so selecting a new file while one is loaded sends `cancel` for the old load and starts a fresh one (FR-010), replacing all displayed data — fixed at the protocol level in `worker.ts` (a new `load` message now always aborts any in-progress one first, so callers can't forget to cancel) rather than only in the UI layer

**Verification status**: `npx tsc -b`, `npm run build`, and the full Vitest suite (27/27) all pass, and the worker now shows up as its own chunk in the production build (confirming Vite recognizes the `new Worker(new URL(...))` pattern). Manually confirmed via `curl` against the dev server that it serves the app shell with the correct `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers and that `/src/app.tsx` and `/src/parser/worker.ts` both resolve. The core parsing pipeline (`looksLikeSaveFile` → `detectVersion` → `parseAndStore`) has since been run directly (bypassing the Worker/React layer, via a one-off Node script) against the **complete real 653MB save** and succeeds end-to-end in ~17s — see `research-save-format.md`'s "Save format parsing: switched to `jomini`".

**Update (2026-09-17, browser click-through now verified)**: Ran the actual Worker/UI flow in a real Chrome tab via `tests/fixtures/rus-1628-minimal.eu5` (the two real save files on disk are 84MB/642MB, over the browser tool's 10MB upload cap, but the bug below reproduced identically with the tiny fixture, proving it wasn't data-dependent). Found and fixed a real, previously-unverified bug this gap had been flagging: `FileLoader.tsx`'s `handleReady` called `getSaveMeta(db)` and `getPlayerNationOverview(db)` concurrently via `Promise.all` on the same wa-sqlite connection. wa-sqlite's async build runs on Asyncify, which unwinds/rewinds a single WASM call stack per module instance — two concurrent queries against the same connection corrupt that shared state. Symptoms were nondeterministic depending on how the race landed: "no such table: nations" (despite the table existing — confirmed by reading the raw OPFS file bytes directly, which showed the schema was written correctly), an OPFS `NotFoundError`, and a WASM "memory access out of bounds" crash, observed across repeated runs. No existing test caught this because every test calls one query at a time against a connection. Fixed by making the two calls sequential (`src/components/Overview/FileLoader.tsx`). Re-verified in the browser afterward: loads cleanly through to the expected result (the unmodified fixture correctly reports "No player nation found," matching `tests/storage/queries.test.ts`'s documented behavior for it). Phase 3 is now fully closed.

**Checkpoint**: User Story 1 is fully functional and independently testable per quickstart.md scenario 1 (nation name/date only) and scenario 2.

---

## Phase 4: User Story 2 - See a basic overview (Priority: P2)

**Goal**: Once a save is loaded, show all six key stats, with
derived/computed stats visually distinguished from raw ones (spec.md User
Story 2, FR-006, FR-007).

**Independent Test**: Load a valid save and confirm the overview renders
the player nation's identity, date, and all six key stats, independent of
any richer visualization or AI-copilot work.

### Implementation for User Story 2

- [x] T026 [US2] Extend `getPlayerNationOverview` in `src/storage/queries.ts` to compute total development (`SUM(locations.development) WHERE owner_idx = :idx`) and province count (`COUNT(*) FROM locations WHERE owner_idx = :idx` — an intentional "location count," not a `provinces`-table count; see data-model.md's Derived Values section for why) exactly as specified in data-model.md (UPDATED after real-save research: aggregates come from `locations`, not `provinces`), tagging both as derived in the returned shape (per contracts/data-access-contract.md). Also implement `at_war` here as `EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = :idx AND status = 'Active')` (per data-model.md's `war_participants` table, populated by the T018 adapter), also required for FR-007 labeling. **Done as part of T024** — same function, same SQL, no reason to implement it twice; `derived` is `Set(["atWar", "totalDevelopment", "provinceCount"])`, verified against RUS's real values in `tests/storage/queries.test.ts`
- [x] T027 [US2] Create `src/components/Overview/OverviewCard.tsx` rendering all six stats: nation name, in-game date, total development, province count, treasury, stability, government type, and current war status (FR-006). Styled per the "Imperial Illuminator" system in `design.md` (added this session): EB Garamond/Literata via `src/styles/tokens.css` (new — design tokens as CSS custom properties, imported once from `main.tsx`), the card following design.md's "Illuminated Cards & Folios" component spec (vellum surface, nested gold/vermilion portolan border, lapis wash header, sharp `0` corners). Wired into `FileLoader.tsx`, replacing its old plain-text name/date display — `Status`'s `ready` variant now carries the full `PlayerNationOverview` instead of just a name string
- [x] T028 [US2] Implement a visible marker (e.g., a "computed" badge or footnote) in `OverviewCard.tsx` for stats flagged as derived in the query result, satisfying FR-007. Done as a bracketed manuscript label (`[ COMPUTED ]`, design.md's "Chips, Badges & Seals") next to the stat's label — text-based, not color-only, per constitution Principle VI
- [x] T029 [P] [US2] Write a component test in `tests/components/OverviewCard.test.tsx` asserting derived stats carry the visual marker and raw stats do not. Done: 3 tests covering all six stats rendering, the derived/raw marker split, and the at-war/at-peace branch. Manually verified in Chrome at both desktop and mobile (390px) widths — reflows to fewer columns cleanly, no overflow, console clean

**Checkpoint**: User Stories 1 AND 2 both work independently; quickstart.md scenario 1 is now fully satisfied.

---

## Phase 5: User Story 3 - Understand failures clearly (Priority: P3)

**Goal**: Distinct, clear messaging for each of the three failure kinds in
FR-009, with no crash or blank state (spec.md User Story 3).

**Independent Test**: Attempt to load a non-save file, a corrupted save,
and an unsupported-version save; confirm each produces a distinct, clear,
actionable message rather than a crash or silent failure.

### Tests for User Story 3 (required by constitution Principle II)

- [ ] T030 [P] [US3] Add fixture-based tests in `tests/parser/errors.test.ts` for all three error kinds — a non-save file, a deliberately truncated/corrupted copy of the T014 fixture, and (if available) a save from an unsupported version — asserting the worker emits the correct `error.kind` for each

### Implementation for User Story 3

- [ ] T031 [US3] Implement FR-002 format validation in `src/parser/worker.ts`: reject unrecognized files early with `error` `kind: "not-a-save"`, before attempting a full parse (satisfies part of T030)
- [ ] T032 [US3] Implement the FR-009 "parse-failed" path in `src/parser/worker.ts`: catch mid-parse failures and send `error` `kind: "parse-failed"` instead of a partial or blank result (satisfies part of T030)
- [ ] T033 [US3] Create `src/components/Overview/ErrorMessage.tsx` rendering the three distinct FR-009 messages based on `error.kind`, replacing any partial UI state in `src/app.tsx`

**Checkpoint**: All user stories 1–3 are independently functional; quickstart.md scenarios 3, 4, and 5 are satisfied.

---

## Phase 6: User Story 4 - Keep a save across sessions (Priority: P4)

**Goal**: Opt-in persistence of one save across browser sessions (spec.md
User Story 4, FR-011–FR-014, SC-005).

**Independent Test**: Load a save, choose to keep it, close and reopen the
tool, and confirm that save's overview is available again without
re-uploading.

### Implementation for User Story 4

- [x] T034 [US4] Implement `keepSave`, `forgetKeptSave`, and `listKeptSave` in `src/storage/queries.ts` against OPFS, enforcing the Assumptions rule that only one save may be kept at a time (keeping a new save deletes any previously kept database). Done: `save_meta.kept` is the source of truth for any code with the database already open, plus a small `localStorage` pointer (`nauticalbeg.keptSave`) so `listKeptSave()` can answer without opening OPFS at all — there's no other cheap way to know "which one is kept" across separate per-save database files. Quota handling (FR-014) is left to T036
- [x] T035 [US4] **Fix FR-005/FR-012 default-retention gap** (found by `/speckit-analyze`): every loaded save currently persists in OPFS forever, kept or not — `openSaveDatabase` (`src/storage/db.ts`) always creates the database on the OPFS VFS, and `closeSaveDatabase` only calls `sqlite3.close()`, never deletes the underlying OPFS file. Implemented actual deletion of a save's OPFS database in two places: (a) when it is replaced by a newly loaded save — `worker.ts` now remembers the previous `ready` saveId and, once the new load finishes, calls the new `cleanupSaveIfNotKept` (`src/storage/queries.ts`) on it — and (b) on session end/app teardown, via a `beforeunload` handler in `FileLoader.tsx` calling the same function on the currently-displayed save. Both skip deletion iff `save_meta.kept = 1`. `deleteSaveDatabase` (`db.ts`) also gained a `vfsName` param so it no-ops for non-OPFS (test) VFSes instead of touching `navigator.storage`. **Known limitation**: `beforeunload` cannot reliably await async work, so (b) is best-effort — the (a) supersede path is the mechanism that's actually guaranteed to run
- [ ] T036 [US4] Implement FR-014 in `src/storage/queries.ts`: catch a storage-quota error during `keepSave` and surface it clearly without corrupting the existing kept save or leaving a partially-written database
- [ ] T037 [US4] Create `src/components/Overview/KeepSaveToggle.tsx` letting the user keep (FR-011) or forget (FR-013) the current save
- [ ] T038 [US4] On startup, call `listKeptSave()` from `src/app.tsx` and, if one exists, offer to resume it before requiring a fresh upload (Acceptance Scenario 2)
- [x] T039 [P] [US4] Write an integration test in `tests/storage/keep-save.test.ts` covering: keep → simulated reload → resume; forget → no longer offered; keeping a second save replaces the first; **and (per T035) that an unkept save's OPFS database is actually deleted on replace and on session end**. Done at the storage layer (5/5 tests) — `deleteSaveDatabase` is asserted (via spy) to be called for an unkept save and not for a kept one, and the keep/forget/list pointer roundtrip is verified against real SQLite state. **Not covered**: an actual browser-verified check that bytes are gone from real OPFS (no OPFS in Node/jsdom — same documented gap as T025), and the resume-through-UI flow, which needs T037/T038 to exist first

**Checkpoint**: All four user stories are independently functional; quickstart.md scenarios 6 and 7 are satisfied.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories.

- [ ] T040 [P] Update `ARCHITECTURE.md` to reflect the as-built module boundaries and note any deviations from plan.md/data-model.md
- [ ] T041 [P] Verify `OverviewCard.tsx` and `ErrorMessage.tsx` against constitution Principle VI (text contrast, no color-only meaning) and note the check per the constitution's Development Workflow section
- [ ] T042 Run the full quickstart.md validation pass (all 8 scenarios) against a real save file, in both the local dev server and the Docker container (T005/T006)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational and on US1's worker/storage wiring being in place (it extends the same query and displays alongside US1's identity display) — implement after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and US1's worker skeleton (adds error paths to the same worker) — independent of US2.
- **User Story 4 (Phase 6)**: Depends on Foundational's storage layer (T010–T012) — independent of US2/US3, could be built in parallel with either.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Within Each User Story

- Fixture tests before the parser logic they cover (constitution Principle II — applies to US1 and US3).
- Storage/query changes before the UI components that consume them.
- Story checkpoint reached only once its Independent Test passes.

### Parallel Opportunities

- T003–T008 (Setup) can all run in parallel once T002 exists.
- T012 and T014 (Foundational) can run in parallel with T010–T011.
- T015 and T016 (US1 tests) can run in parallel with each other.
- US3 (Phase 5) and US4 (Phase 6) can be built in parallel by different people once US1 (Phase 3) is done — neither depends on the other.

---

## Parallel Example: User Story 1

```bash
# Launch both fixture tests for User Story 1 together:
Task: "Fixture test for version detection in tests/parser/version-detect.test.ts"
Task: "Fixture test for the first version adapter in tests/parser/adapter.test.ts"

# Then, once fixtures exist, save-reader can proceed alongside them:
Task: "Implement streaming save-reader in src/parser/save-reader.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (repo, containerization, architecture guide).
2. Complete Phase 2: Foundational (storage schema, worker skeleton, first real fixture).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run quickstart.md scenarios 1 (partial) and 2 against a real save.
5. Demo: "select a save, see your nation and the date."

### Incremental Delivery

1. Setup + Foundational → containerized dev environment ready, architecture documented.
2. Add User Story 1 → validate independently → this is the MVP.
3. Add User Story 2 → full overview with derived-value labeling → validate independently.
4. Add User Story 3 → error handling hardened → validate independently.
5. Add User Story 4 → opt-in persistence → validate independently.
6. Polish.

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- [Story] labels map every implementation task back to spec.md for traceability.
- Constitution Principle II is non-negotiable: T015, T016, and T030 must exist and fail before their corresponding implementation tasks are done.
- Commit after each task or logical group (repo is initialized as of T001; no commits have been made yet — the first commit is left to you/the implementer to time deliberately rather than being bundled into a setup task).
- Docker (T005/T006) and the architecture guide (T007, refreshed at T040) were added per explicit request, layered onto the standard Setup/Foundational/Polish phases rather than replacing them.
- T035 was added by `/speckit-analyze` (2026-09-17) after finding that T025's "replace" flow and the absence of any session-teardown cleanup meant every loaded save — kept or not — was silently persisting in OPFS forever, violating FR-005/FR-012's session-only default.
