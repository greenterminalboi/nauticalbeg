---

description: "Task list for Full Save-File Schema Mapping (Tooling)"
---

# Tasks: Full Save-File Schema Mapping (Tooling)

**Input**: Design documents from `/specs/004-full-schema-mapping/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-contract.md, quickstart.md (all present)

**Tests**: Included and REQUIRED — constitution Principle II makes
fixture-based parser tests non-negotiable for User Story 2's
`schema.sql`/adapter changes, and the spec's own FR-007 makes the same
requirement explicit for this feature. User Story 1's classification
logic additionally gets fast, fixture-independent unit tests since it's
the feature's core correctness surface (research.md §2/§3's
normalization and classification rules).

**Organization**: Tasks are grouped by user story (spec.md priorities
P1–P3), mirroring 002/003's `tasks.md` structure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Paths are relative to the repository root (single-project layout per plan.md)

---

## Phase 1: Setup

**Purpose**: Scaffold `tools/schema-mapping/` and its test directory,
mirroring `tools/map-generation/`'s existing precedent exactly, and wire
up the npm entry point both later phases' CLI modes share.

- [X] T001 Create the `tools/schema-mapping/` directory with empty
      module files: `types.ts`, `classify.ts`, `inventory.ts`,
      `diff.ts`, `format-markdown.ts`, `generate.ts`, and an
      `inventories/.gitkeep` (the committed-output directory
      contracts/cli-contract.md's `--out` default writes into).
- [X] T002 [P] Create the `tests/schema-mapping/` directory (flat
      layout, mirroring `tests/map-generation/`'s existing precedent —
      not nested under `tests/tools/`).
- [X] T003 Add a `"schema-map": "tsx tools/schema-mapping/generate.ts"`
      script to `package.json`, alongside the existing `"generate:map"`
      entry, per contracts/cli-contract.md's `npm run schema-map --
      <inventory|diff> ...` invocation shape.

**Checkpoint**: Directory/test scaffold and npm entry point exist;
nothing runs yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared type definitions every later phase depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define data-model.md's entities in `tools/schema-mapping/types.ts`:
      the `FieldValueType` union (`"string" | "number" | "boolean" |
      "date" | "fixed_object" | "variable_object" | "list" |
      "list_of_objects" | "empty_object"`), and the
      `FieldInventoryEntry`, `SectionInventory`, `SaveInventory`, and
      `DriftReport` interfaces exactly as data-model.md specifies each
      field (including `FieldInventoryEntry.presence`'s
      `"always" | "sometimes"` union and `childKeys` being `undefined`
      for anything other than `fixed_object`).

**Checkpoint**: Shared types compile; User Stories 1 and 3 can now
proceed independently (User Story 2 depends on User Story 1's actual
inventory output, not just its types).

---

## Phase 3: User Story 1 - Automated field-inventory discovery (Priority: P1) 🎯 MVP

**Goal**: A CLI tool that walks every top-level section of a real save
and produces a reviewable, version-controlled Save Inventory (spec.md's
User Story 1).

**Independent Test**: Run `npm run schema-map -- inventory --save
<real-save-path>` and confirm the produced inventory lists every field
path manual research already confirmed, plus at least one from a
never-researched section (e.g. `population`), each with a correct
observed type (quickstart.md Scenario 1).

### Tests for User Story 1 (constitution Principle II — write first, confirm they fail before implementation)

- [X] T005 [P] [US1] Write unit tests in
      `tests/schema-mapping/classify.test.ts` against small,
      hand-crafted jomini-shaped objects (no real save needed) covering:
      a field with the same type on every sampled entry gets
      `observedTypes: ["number"]` and `presence: "always"`
      (data-model.md's `FieldInventoryEntry`); a field absent on some
      entries gets `presence: "sometimes"`; a nested object whose
      key-set recurs identically across every sampled entry gets
      `observedTypes: ["fixed_object"]` with `childKeys` set to that
      recurring key-set (research.md §3); a nested object whose key-set
      differs substantially entry to entry gets
      `observedTypes: ["variable_object"]` with `childKeys` left
      `undefined`; a field that is `{}` on every sampled entry gets
      `observedTypes: ["empty_object"]` (spec's Edge Cases); a field
      holding genuinely different types across entries (e.g. sometimes
      a number, sometimes a string) gets both types listed in
      `observedTypes`, never collapsed to one (constitution Principle IV).
- [X] T006 [P] [US1] Write unit tests in
      `tests/schema-mapping/inventory.test.ts` (hand-crafted jomini-tree
      inputs, not the real fixture) covering: a top-level key that
      occurs exactly once comes back from jomini as a bare object, and
      the walker's `toArray`-style normalization (research.md §2) must
      classify it identically to the same key occurring twice as an
      array — asserting both cases produce the same `observedTypes` for
      that path rather than a false type-inconsistency; a section that
      is present but entirely empty in the sample gets
      `shapeConfirmed: false` (spec's Edge Cases) rather than a
      fabricated `entries` list; a section this test's hand-crafted
      input never labels as "known" still appears in
      `SaveInventory.sections` (data-model.md's Validation Rules —
      never silently skipped for being unrecognized).
- [X] T007 [US1] Write a fixture-based regression test in
      `tests/schema-mapping/inventory.fixture.test.ts` (mirroring
      `tests/map-generation/join-with-save.test.ts`'s pattern of reading
      `tests/fixtures/rus-1628-minimal.eu5` directly via
      `readFileSync`/`path.resolve(process.cwd(), ...)`) asserting a
      real parse-and-inventory run against that fixture produces: a
      `SaveInventory.sections` entry for **every** top-level key jomini
      returns for this fixture (`metadata`, `countries`, `provinces`,
      `locations`, `war_manager`, `cheats`, `played_country` — not only
      the ~5 the app currently interprets); `countries` →
      `database.*.currency_data.gold` classified `["number"]`,
      `presence: "always"`; `countries` → `database.*.previous_tags`
      classified as a list type, `presence: "sometimes"` (only RUS has
      it in this fixture); `provinces` →
      `database.*.last_month_produced` classified
      `["variable_object"]` (this fixture only has one province example
      of it, so this specific assertion documents the single-sample
      case — Acceptance Scenario 3's full-population confirmation
      happens against the real save in T011, not this fixture test).

### Implementation for User Story 1

- [X] T008 [US1] Implement `tools/schema-mapping/classify.ts`: given a
      field path and every sampled value observed for it across a
      section's entries, compute `observedTypes` (one entry per
      distinct `FieldValueType` actually seen — never collapsed),
      `presence` (`"always"` only if found on every sampled entry),
      `exampleValue` (one real value, verbatim), and, for object-typed
      values, the cross-entry key-set comparison from research.md §3
      that decides `fixed_object` (a recurring, bounded key-set —
      populate `childKeys`) vs. `variable_object` (a key-set that varies
      entry to entry) vs. `empty_object` (every sampled instance was
      `{}`). Satisfies T005.
- [X] T009 [US1] Implement `tools/schema-mapping/inventory.ts`: the core
      tree-walker. Given a parsed jomini root object, enumerate every
      top-level key (FR-001 — not limited to a hardcoded allowlist),
      and for each, recursively walk every nested field path across
      **every** entry of any repeated (`database`-shaped or array-typed)
      collection — full scan, not sampling, per the Clarifications
      session and research.md §1/§3 (both optionality detection and
      fixed-vs-variable classification require seeing every entry, not
      a sample). Apply jomini's repeated-key normalization
      (`toArray`-equivalent, research.md §2) to every field before
      calling `classify.ts` on it. Mark a section's
      `shapeConfirmed: false` when it was present but had zero sampled
      entries to classify from (spec's Edge Cases). De-duplicate by
      path per data-model.md's Validation Rules. Satisfies T006/T007.
- [X] T010 [US1] Implement `tools/schema-mapping/format-markdown.ts`:
      render a `SaveInventory` as a human-readable Markdown document
      (research.md §4) — one section per top-level key, each field path
      listed with its `observedTypes`, `presence`, and `exampleValue`;
      sections with `shapeConfirmed: false` visually flagged as
      "shape not confirmed from this sample" rather than presented as
      complete.
- [X] T011 [US1] Implement `tools/schema-mapping/generate.ts`'s
      `inventory` CLI mode per contracts/cli-contract.md: `parseArgs`
      for `--save` (required), `--out` (optional, default
      `tools/schema-mapping/inventories/<save-basename>.json`), and
      `--markdown` (optional flag); `main()` calls
      `Jomini.initialize()`/`parseText(bytes, { typeNarrowing:
      "unquoted" })` (confirmed working under plain Node/tsx per
      research.md §1 — no jsdom/browser shim needed), then
      `inventory.ts`'s walker, then writes the resulting JSON (and
      Markdown, if requested) to `--out`; a `CliError` subclass and
      guarded `main()` invocation mirroring
      `tools/map-generation/generate.ts`'s exact shape (exported
      functions for testability, `if (import.meta.url ===
      \`file://${process.argv[1]}\`)` guard); implements
      contracts/cli-contract.md's exit-behavior table exactly (missing
      `--save` path or unparseable file → non-zero exit, clear error,
      no output file written).
- [X] T012 [US1] Manually run quickstart.md Scenarios 1-3 against the
      real save (`Russia (Melted).eu5`, per the Clarifications) and the
      committed fixture: confirm the section count matches jomini's own
      top-level key count for the real save (not bounded by the
      fixture's known gaps), spot-check the Markdown summary's specific
      assertions (currency_data.gold, previous_tags, last_month_produced,
      at least one never-researched section like `population`), and
      confirm two runs against the same save produce identical output
      (Acceptance Scenario 5). **Four real bugs found and fixed during
      this pass** (none caught by the fixture, which is too small to
      exercise them) — see research.md §6 for full detail: (1) a real
      `RangeError: Maximum call stack size exceeded` from spreading
      28,573+ array elements into `push()`, not from recursion depth
      (fixed with a plain loop; a genuine `MAX_WALK_DEPTH` guard was also
      added for real deep nesting, though it wasn't the actual cause
      here); (2) real save keys include decimal-formatted strings
      ("0.03388"), not just integers, which an integer-only numeric-key
      pattern missed entirely; (3) a numeric-keyed collection
      (`diplomacy_manager`) can sit directly at a section's own top
      level, not only under a named sub-key like `.database`; (4) a
      numeric-keyed collection can have a minority of named keys mixed
      in alongside its indexed entries (`diplomacy_manager`'s 12 named
      action-type keys alongside its 2,470 per-country entries), needing
      a ratio-based (not all-or-nothing) collection-detection rule. A
      fifth finding changed this feature's own scope: the real save's
      full inventory is 285MB JSON + 262MB Markdown — far too large to
      commit, so `tools/schema-mapping/inventories/` is gitignored in
      full rather than committing any generated inventory (FR-004 is
      satisfied by the tool's code and its fixture-based test instead).
      Final real-save result after all fixes: 79 sections, 15,133 field
      paths, ~25-30s runtime, spot-checked clean of further
      misclassification, determinism confirmed across two runs.

**Checkpoint**: User Story 1 is independently functional — a maintainer
can inventory any save without any schema/database work having happened
yet.

---

## Phase 4: User Story 2 - Apply the inventory to a complete, typed database schema (Priority: P2)

**Goal**: Turn User Story 1's real-save inventory into actual typed
DuckDB columns for at least one previously-uninterpreted section
(spec.md's User Story 2).

**Independent Test**: Query the resulting database for a field from a
newly-captured section and confirm it comes back as a real,
individually-typed value (quickstart.md Scenario 4).

**Note on scope**: Which sections/fields get promoted to real schema is
a finding of running User Story 1's tool against the real save (T012),
not knowable in advance — the tasks below are written to be repeated
for each section chosen, starting with the one the spec itself uses as
its running example (`population`). This mirrors how `specs/002-db-technology-migration`'s
deferred stories (US4-US7) handled research-dependent scope.

### Selection

- [X] T013 [US2] Review the real-save Markdown inventory from T012 and
      select at least one previously-uninterpreted top-level section to
      capture into real schema this phase — at minimum, `population`
      (the section the spec itself names as its running example in
      FR-002/SC-001/quickstart.md's Scenario 1). Record which specific
      field paths within it will get real columns vs. lossless JSON
      capture, per FR-005/FR-006's rule (fixed-shape scalars → columns;
      variable-keyed/deeply-nested → a JSON-typed column) — this
      decision must cite the T012 inventory's own classification for
      each path, not be made freehand.

### Tests for User Story 2 (constitution Principle II, NON-NEGOTIABLE — write first, confirm failing)

- [X] T014 [US2] Extend `tests/fixtures/rus-1628-minimal.eu5` with a
      real, verbatim excerpt covering T013's selected field paths,
      copied from the real save at the specific source location the T012
      inventory identifies — following `research-save-format.md`'s
      existing fixture-composition method (real field names and values,
      trimmed of irrelevant surrounding detail, never invented).
- [X] T015 [P] [US2] Write a failing fixture-based regression test in
      `tests/parser/adapter.test.ts` asserting the 1.3.11 adapter parses
      T013's selected section into the new column(s)/table with the
      exact values T014's fixture excerpt contains — written and
      confirmed failing before T017/T018.

### Implementation for User Story 2

- [X] T016 [US2] Add the new column(s) or table to
      `src/storage/schema.sql` for T013's selected section, using
      DuckDB dialect consistent with the existing schema (`DOUBLE` not
      `REAL`; a `CREATE SEQUENCE` + `DEFAULT nextval(...)` for any new
      synthetic key, matching `raw_sections.id`'s existing pattern) —
      fixed-shape fields as individually-typed columns (FR-005),
      variable-keyed/deeply-nested fields as a single DuckDB
      JSON-typed column holding the full sub-structure losslessly
      (FR-006) rather than invented flat columns for keys that aren't
      actually fixed.
- [X] T017 [US2] Extend `src/parser/version-adapters/1.3.11.ts` to
      populate the new column(s)/table from T013's selected section,
      satisfying T015's failing test. Follow the existing
      Arrow-bulk-insert shape (`insertRows`'s
      `INSERT INTO table (col1, col2, ...) VALUES (?1, ?2, ...)`
      pattern, every column supplied positionally) per
      ARCHITECTURE.md's "Bulk inserts: Arrow, not a row-by-row
      prepared-statement loop" section, rather than introducing a new
      insert shape.
- [X] T018 [US2] For any field path T013 designated "too unpredictable
      to model as columns" (FR-011), add a one-line note to research.md
      (or a comment at the relevant `schema.sql` column) naming the
      section/path and why — e.g., "genuinely per-entry-variable, kept
      as JSON" — rather than leaving the determination undocumented.
- [X] T019 [US2] Manually run quickstart.md Scenario 4: confirm T013's
      selected field(s) are retrievable via a single direct `SELECT`
      against the resulting database, with no JSON-blob parsing
      required on the caller's side for the fixed-shape columns
      (SC-003).

**Checkpoint**: User Stories 1 and 2 are both independently functional —
at least one previously-opaque section is now real, queryable schema.

---

## Phase 5: User Story 3 - Cross-version drift detection (Priority: P3)

**Goal**: Diff two Save Inventories and report every field
addition/removal/type change between them (spec.md's User Story 3).

**Independent Test**: Run the tool against two saves with a deliberately
different shape and confirm the drift report names exactly the
introduced changes and nothing else (quickstart.md Scenario 5).

### Tests for User Story 3 (constitution Principle II — write first, confirm failing)

- [X] T020 [P] [US3] Write unit tests in
      `tests/schema-mapping/diff.test.ts` against hand-crafted
      `SaveInventory` JSON objects (data-model.md's shape) covering:
      a field path present in `candidate` but not `baseline` appears in
      `added`; a field path present in `baseline` but not `candidate`
      appears in `removed`; the same field path with different
      `observedTypes` between the two appears in `typeChanged` with
      both `before` and `after` recorded; two structurally identical
      inventories produce `added: []`, `removed: []`, `typeChanged: []`,
      and `hasDrift: false` explicitly (spec's Acceptance Scenario 3 —
      never an empty/ambiguous result).

### Implementation for User Story 3

- [X] T021 [US3] Implement `tools/schema-mapping/diff.ts` per
      data-model.md's `DriftReport` shape and Validation Rules —
      `hasDrift` MUST be computed as exactly
      `added.length > 0 || removed.length > 0 || typeChanged.length > 0`,
      never hand-set. Satisfies T020.
- [X] T022 [US3] Implement `tools/schema-mapping/generate.ts`'s `diff`
      CLI mode per contracts/cli-contract.md: `parseArgs` for
      `--baseline`/`--candidate` (both required) and `--out` (optional —
      default: print to stdout only); validates both inputs are
      well-formed `SaveInventory` JSON (contracts/cli-contract.md's exit
      behavior table — a missing/invalid input is a non-zero exit with a
      clear error naming which input and why) before calling `diff.ts`.
- [X] T023 [US3] Manually run quickstart.md Scenario 5: copy the
      committed fixture, hand-introduce one field rename, one field
      removal, and one type change, inventory both files, run `diff`,
      and confirm the report names exactly those three changes and
      nothing else; separately confirm diffing a file against itself
      reports `hasDrift: false` explicitly. Confirmed exactly as
      specified: an added `currency_data.new_stat`, a removed
      `previous_tags` (chosen because it's RUS-only in the fixture — a
      shared field's removal only reduces its *presence* across
      entries, not the field path itself, from the diff's perspective),
      and `currency_data.inflation` flagged as a `number` -> `string`
      type change — nothing else reported. Self-diff confirmed
      `hasDrift: false` explicitly, with a "No drift found." message.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories.

- [X] T024 [P] Update `ARCHITECTURE.md` with a new section documenting
      this tooling addition: what `tools/schema-mapping/` does, the
      full-scan-not-sampling rationale (research.md §1/§3), the
      fixed-vs-variable-keyed classification rule, and the real jomini-
      under-plain-Node finding (research.md §1) — matching this
      project's existing decision-log pattern for `tools/map-generation`
      and the DuckDB/Perspective sections. Done — see ARCHITECTURE.md's
      "Full save-schema mapping tooling" section.
- [X] T025 [P] Confirm `tools/schema-mapping/` introduces no
      `architecture_constitution.md` module-boundary violation: it must
      never import `src/storage/db.ts`'s connection lifecycle or open a
      live `SaveDatabase` (contracts/cli-contract.md's "Non-goals" — it
      only reads save files and reads/writes its own JSON/Markdown);
      User Story 2's `schema.sql`/adapter changes must land only in
      their existing designated files, per the Data module's existing
      "every SQL statement lives in `src/storage/`" rule. Confirmed via
      a direct grep: zero imports from `src/` anywhere under
      `tools/schema-mapping/`; User Story 2's changes landed only in
      `src/storage/schema.sql` and `src/parser/version-adapters/1.3.11.ts`.
- [X] T026 Run the full quickstart.md Definition of Done checklist
      end-to-end (all 5 scenarios) and record the result. All 5 verified
      during implementation (T012, T019, T023): real-save inventory
      spot-checked and Markdown-reviewed; fixture inventory covered by
      an automated regression test; determinism confirmed across two
      real-save runs; `population` applied to real schema and verified
      queryable at both fixture and real (215,197-row) scale; drift
      detection confirmed against a synthetic 3-change modification and
      a self-diff.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational and on User Story
  1's real-save inventory run (T012) existing — its selection step
  (T013) reads that inventory's findings directly.
- **User Story 3 (Phase 5)**: Depends on Foundational and on User Story
  1's `SaveInventory` JSON shape existing (T009/T011) to have something
  to diff — does NOT depend on User Story 2 at all (diffing operates on
  inventory JSON, never on the database).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests before implementation in every phase (constitution Principle
  II for US2; this feature's own correctness-first approach for US1/US3).
- Within User Story 1: `classify.ts` (T008) before `inventory.ts` (T009)
  before `format-markdown.ts` (T010) before `generate.ts`'s CLI wiring
  (T011).
- Within User Story 2: selection (T013) before fixture extension (T014)
  before the failing test (T015) before schema (T016) before adapter
  (T017).
- Within User Story 3: `diff.ts` (T021) before `generate.ts`'s `diff`
  mode (T022).

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel.
- T005 and T006 (US1 tests) can run in parallel — different files, no
  shared state.
- T020 (US3's only test task) can run in parallel with any of User
  Story 2's tasks — the two stories don't share files.
- T024 and T025 (Polish) can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Both test files are independent (different hand-crafted inputs, no shared fixture):
Task: "Write classify.ts unit tests in tests/schema-mapping/classify.test.ts"
Task: "Write inventory.ts unit tests in tests/schema-mapping/inventory.test.ts"

# Once both pass locally against a stub implementation, proceed to:
Task: "Implement classify.ts"
Task: "Implement inventory.ts (depends on classify.ts)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (shared types).
3. Complete Phase 3: User Story 1 (the inventory tool itself).
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1-3 against the
   real save and the fixture.
5. Demo: "run this one command against any save, get back a complete,
   reviewable map of everything the save actually contains — including
   sections nobody has ever manually researched."

### Incremental Delivery

1. Setup + Foundational → shared types ready.
2. Add User Story 1 → validate independently → this is the MVP (a real
   inventory tool, zero schema/database changes required yet).
3. Add User Story 2 (apply findings to real schema, starting with
   `population`) → validate independently → the first previously-opaque
   section becomes real, queryable columns.
4. Add User Story 3 (drift detection) → validate independently → this
   closes the loop the spec's own motivation names ("this game is going
   to get updated like crazy").
5. Polish.

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- [Story] labels map every implementation task back to spec.md for
  traceability.
- Constitution Principle II is non-negotiable for User Story 2: every
  fixture-extension/adapter-test pair must exist and fail before its
  corresponding schema/adapter task is done.
- User Story 2's exact task count may grow if a maintainer chooses to
  promote more than one section per pass — T013-T019 are written as one
  repeatable cycle, not a one-shot list; repeat them per additional
  section chosen, same as 002's US4-US7 pattern for research-dependent
  scope.
- Commit after each task or logical group, consistent with this
  project's established rhythm.
- **2026-09-19**: the anticipated repeat cycle happened — `wars`
  (`war_manager.database`) was promoted as User Story 2's second
  section, following the exact T013-T019 pattern used for `population`
  (see research.md §8 for the full real findings, including an
  independent re-confirmation of the same `BIGINT`-entity-index issue).
  `specs/004-full-schema-mapping/schema-summary.md` was also added (see
  research.md §9) — a curated narrative companion to the tool's own
  generated inventory, covering all 79 top-level sections. Both are
  complete; this feature has no further open work.
