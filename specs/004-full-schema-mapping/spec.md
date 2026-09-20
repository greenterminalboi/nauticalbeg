# Feature Specification: Full Save-File Schema Mapping (Tooling)

**Feature Branch**: `004-full-schema-mapping`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "next feature is a research based feature, so we have our save file, this game is going to get updated like crazy, so the schema of these tables is going to change and we're going to need to account for that, I think is a feature that belongs in tooling maybe ? anyways this feature deals with really breaking down the schema of the savefile fully down to a 1 to 1 column if you will, we already have jomi, but we really would like it if everything truly is surfaceable to perspecitve and i mean everything. This feature needs to be maintainable, it needs to be rigourous. dont worry about the ui or data binding right now, just worry about a thurugho modeling of the savefiles data that can be surfaced"

## Clarifications

### Session 2026-09-19

- Q: Which save file(s) must the tool successfully run against for this feature to be considered complete? → A: Both — the committed fixture (`tests/fixtures/rus-1628-minimal.eu5`) is used for repeatable automated regression tests of the tool's classification logic, and a real, full-size save the user supplied (`Russia (Melted).eu5`, ~642MB, at a local path outside the repo) is the actual completeness signal: its inventory run is what drives which sections User Story 2 actually captures into real schema, since the fixture is known to omit real structure (per `research-save-format.md`'s own fixture-composition notes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated field-inventory discovery (Priority: P1) 🎯 MVP

Today, "what fields does the save actually contain" is answered by a
maintainer manually re-reading megabytes of raw save text section by
section (as `research-save-format.md` did for `countries`/`provinces`
and a handful of others) — a slow, error-prone, one-off process that
only ever covers whichever section the current UI feature happens to
need. As a maintainer, given a real EU5 save file, I want a repeatable
tool that walks **every** top-level section and every nested field path
inside it, and records each path's observed type(s), whether it's
present on every entry or only some, and a real example value — so the
save's actual structure is documented by running a tool against real
data, not by hand, and that documentation stays trustworthy as the tool
is re-run against future saves.

**Why this priority**: Everything else in this feature (a complete
DuckDB schema, drift detection across game versions) depends on this
inventory existing first — it's the foundation. It's also independently
valuable on its own: even with zero schema/database changes, replacing
today's fragile, partial, hand-written "confirmed fields" notes with a
real, complete, machine-produced inventory is a meaningful improvement
by itself.

**Independent Test**: Run the tool against the real save (per
Clarifications) and confirm the produced inventory lists every field
path that manual research has already confirmed exists (e.g.,
`countries.database.*.currency_data.gold`), *plus* at least one field
path from a section that has never been manually researched (e.g.,
`population`), with a correct observed type for each. Separately, run
the tool against the committed fixture and confirm its own regression
test asserts the expected classification for every field path the
fixture is known to contain.

**Acceptance Scenarios**:

1. **Given** a real save file, **When** the tool runs, **Then** it
   produces an inventory covering every top-level key found in the save
   — not only the handful of sections a human has already inspected.
2. **Given** a field that holds the same kind of value (e.g., a number)
   on every sampled entry, **When** the tool records it, **Then** its
   inventory entry reflects that scalar type and at least one real
   example value.
3. **Given** a field whose value is a map with an open-ended, data-driven
   set of keys (e.g., a per-trade-good production breakdown, where the
   key names themselves vary by province), **When** the tool records it,
   **Then** the inventory marks it as a variable/dynamic-keyed structure,
   distinct from a fixed, named set of sub-fields.
4. **Given** a field present on some entries of a section but absent on
   others (e.g., a field only set once a country has an heir), **When**
   the tool records it, **Then** the inventory marks it as
   optional/sometimes-absent rather than assuming every entry has it.
5. **Given** the tool is re-run against the same save a second time,
   **When** its output is compared to the first run, **Then** the two
   inventories are identical (the process is deterministic, not
   dependent on object-key iteration order or sampling luck).

---

### User Story 2 - Apply the inventory to a complete, typed database schema (Priority: P2)

Building on User Story 1's inventory, extend the save's database schema
and parsing logic so every top-level section's data is actually captured
into real, appropriately-typed columns — following one consistent,
documented rule for how a nested field path becomes a column (or, where
a field is genuinely variable-shaped and a fixed column can't represent
it, a lossless structured value rather than being dropped or left
inside an undifferentiated catch-all).

**Why this priority**: This is the actual "surfaceable" deliverable — an
inventory alone documents the save's shape but doesn't make any of that
data queryable. It depends on User Story 1 existing first, since there's
nothing to systematically apply until the inventory exists.

**Independent Test**: After running the tool against the real save (per
Clarifications), directly query the resulting database for a field from a section that
was previously only captured as opaque, undifferentiated data (e.g.,
something from `population`) and confirm it comes back as a real,
individually-typed value, not as a byte range the caller has to parse
out of a larger blob themselves.

**Acceptance Scenarios**:

1. **Given** the inventory from User Story 1 records a field as a
   consistently-typed scalar present on (nearly) every entry, **When**
   this feature's schema/parsing work runs, **Then** that field is
   captured as its own real, appropriately-typed column.
2. **Given** the inventory records a field as a variable-keyed map or a
   deeply-nested, highly variable per-entity detail block, **When** this
   feature's schema/parsing work runs, **Then** the field's full content
   is still captured losslessly (nothing silently dropped), even though
   it isn't represented as one column per possible key.
3. **Given** a top-level section this feature newly captures, **When** a
   maintainer inspects the change, **Then** it is backed by a real,
   committed fixture (real field values, not invented ones) and a
   regression test asserting the parsed/captured result — consistent
   with this project's existing non-negotiable parser-testing rule.
4. **Given** a section whose real-world content turns out too
   unpredictable to capture with any reasonable column-level fidelity
   (e.g., truly freeform or deeply recursive data), **When** this
   feature's schema/parsing work runs, **Then** that section is left
   exactly as-is in today's existing catch-all rather than forcing a
   bad fit, and this is called out explicitly rather than silently
   skipped.

---

### User Story 3 - Cross-version drift detection (Priority: P3)

Given inventories produced from two different saves — most usefully,
saves from two different EU5 game versions — produce a clear report of
which fields were added, removed, or changed in observed type between
them, so a future game patch's save-format changes are caught and
documented explicitly rather than silently breaking parsing or quietly
producing wrong data for an existing feature.

**Why this priority**: This is the part of the feature that most
directly answers the stated motivation ("this game is going to get
updated like crazy") — but it depends on User Story 1's inventory
mechanism already existing, and its real value only shows up once a
second, differently-versioned save actually exists to compare against.
Building the capture pipeline itself (User Stories 1-2) delivers value
immediately, on the one save version available today; this closes the
loop for when the game updates.

**Independent Test**: Run the tool against two saves with a deliberately
different shape (e.g., the real fixture, plus a modified copy with a
field renamed, a field removed, and a field's value type changed from a
number to a string) and confirm the drift report correctly names all
three changes and nothing else.

**Acceptance Scenarios**:

1. **Given** two inventories where a field exists in one but not the
   other, **When** the drift tool compares them, **Then** the report
   lists that field as added (or removed, depending on comparison
   direction) rather than silently ignoring the difference.
2. **Given** two inventories where the same field path is a number in
   one and a string in the other, **When** the drift tool compares them,
   **Then** the report flags a type change for that specific field.
3. **Given** two inventories with no differences, **When** the drift
   tool compares them, **Then** the report clearly states no drift was
   found, rather than an empty or ambiguous result.

---

### Edge Cases

- What happens when the same field path holds genuinely different value
  types across different entries within a *single* save (not a
  version-to-version comparison, but real inconsistency within one
  file)? The inventory MUST record every type actually observed for that
  path rather than picking one and discarding evidence of the other.
- What happens when a section is entirely empty in the sampled save
  (e.g., a save with no active wars)? The tool MUST report that the
  section exists but that its internal shape could not be confirmed from
  this sample, rather than fabricating a guessed structure or silently
  omitting the section from the inventory.
- What happens when a future save contains a top-level section this
  tool has never encountered before (a brand-new section introduced by a
  game patch)? It MUST appear in the inventory like any other section,
  not be silently skipped for being unrecognized.
- What happens when a field path is deeply recursive or self-referential
  in a way that makes exhaustive flattening impractical? The tool MUST
  still record that the field exists and its outer shape, without being
  required to flatten infinitely — see User Story 2's Acceptance
  Scenario 4 for how the schema-application step handles this case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST parse a given save file via the project's
  existing jomini-based parsing path and enumerate every top-level
  section key present in the save, not only the sections a human has
  already manually researched.
- **FR-002**: For each top-level section, the tool MUST recursively walk
  every nested field path within it and record, per distinct path: every
  value type actually observed for it, whether it was present on every
  sampled entry of its parent collection or only some, and at least one
  real example value copied from the source save.
- **FR-003**: The tool MUST distinguish, for each field path, between a
  fixed, named set of sub-fields (e.g., a `currency_data` object whose
  keys are a consistent, enumerable set like `gold`/`stability`) and an
  open-ended, data-driven set of keys (e.g., a production breakdown keyed
  by trade-good name, where the keys themselves vary by entry).
- **FR-004**: The inventory the tool produces MUST be a reviewable,
  version-controlled artifact suitable for being read by a maintainer
  and re-diffed on a future run — not a one-off console log discarded
  after the tool exits.
- **FR-005**: For every field path User Story 1's inventory records as a
  consistently-typed scalar or a fixed-shape nested value, this feature
  MUST capture it as a real, individually-typed, queryable column in the
  save's database — not leave it embedded inside an opaque, undifferentiated
  blob.
- **FR-006**: For every field path recorded as a variable-keyed map or a
  deeply-nested, highly variable per-entity detail block, this feature
  MUST still capture its full content losslessly, using a structured
  representation appropriate to genuinely variable data, rather than
  dropping information or inventing fixed columns for keys that aren't
  actually fixed.
- **FR-007**: Every database-schema or parsing-logic change this feature
  makes MUST be accompanied by a committed fixture containing real,
  verified field values and a regression test asserting the
  parsed/captured result — written before the corresponding schema or
  parsing change, consistent with this project's existing non-negotiable
  parser-testing rule.
- **FR-008**: Given two inventories produced from different save files
  (most usefully, different game versions), the tool MUST produce a
  report identifying every field present in one but not the other, and
  every field present in both but with a different observed type between
  them.
- **FR-009**: This feature's scope MUST stop at data capture and
  inventory/drift reporting — it MUST NOT require adding or changing any
  user-facing UI, visualization, or query function intended for UI
  consumption to be complete and useful on its own.
- **FR-010**: The tool(s) this feature produces MUST run as a
  maintainer-facing, offline step under `tools/` (e.g.,
  `tools/schema-mapping/`, alongside the existing
  `tools/map-generation/`), run by hand whenever a new game version's
  save needs checking — not as a feature exposed to end users inside the
  running application, and not run automatically on any schedule or
  save load, since schema drift only happens on Paradox's patch cadence.
- **FR-011**: Where a section's real-world content is determined to be
  too unpredictable to represent with reasonable column-level fidelity,
  this feature MUST document that determination explicitly (which
  section, why) rather than silently leaving it unaddressed or forcing
  an unreliable fit.

### Key Entities

- **Field Inventory Entry**: One discovered field path within the save
  (e.g. `countries.database.*.currency_data.gold`). Attributes: the
  path itself, every value type observed for it, whether it's present on
  every sampled entry or only some, and at least one real example value.
- **Section Inventory**: The complete set of Field Inventory Entries
  belonging to one top-level save section (e.g., everything under
  `population`).
- **Save Inventory**: The complete set of Section Inventories for one
  parsed save file — the full output of User Story 1's tool for a single
  run.
- **Drift Report**: A comparison between two Save (or Section)
  Inventories, listing every field addition, removal, and observed
  type change between them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the tool against the real save (per Clarifications)
  produces an inventory that covers 100% of the save's top-level
  sections — not only the sections a human has manually inspected so
  far, and not bounded by the committed fixture's known gaps.
- **SC-002**: A maintainer can determine whether a specific field exists
  in the save, and what type of value it holds, by consulting the
  produced inventory in under one minute — without needing to open the
  raw save file at all.
- **SC-003**: For a field belonging to a section this feature newly
  captures, a maintainer can retrieve its value with a single direct
  query against the database, without needing to parse it out of a
  larger blob themselves.
- **SC-004**: Given two saves with a known, deliberately introduced
  difference (a field added, removed, or changed in type), the drift
  report correctly identifies 100% of the introduced differences and
  reports zero false differences.

## Assumptions

- This is a developer/maintainer-facing tooling feature, not a runtime
  browser feature — consistent with the user's own framing ("I think is
  a feature that belongs in tooling maybe") and mirroring
  `specs/003-province-map-generation`'s existing offline-tooling pattern
  (a script a maintainer runs locally, not something end users interact
  with). Concretely, this lives at `tools/schema-mapping/`, alongside
  the existing `tools/map-generation/`. Schema drift only happens on
  Paradox's own patch cadence (not per-save, not per-app-session), so
  there's no reason for any part of this to run automatically or inside
  the browser app — a maintainer runs it by hand once per game version
  that needs checking.
- The project's existing jomini-based parsing is reused as-is for
  reading the raw save tree; this feature is about systematically
  *walking and cataloguing* that tree's full shape and *capturing* it
  into the database, not about replacing or reimplementing the
  underlying save-format parser.
- No UI, visualization, or Perspective wiring is in scope for this
  feature (explicit user instruction). "Surfaceable to Perspective"
  describes the *target quality* of the resulting data (real, typed,
  individually queryable columns) rather than a requirement to actually
  build any Perspective view in this feature.
- This feature builds on and extends the existing DuckDB storage layer
  and constitution Principle II's fixture-first testing discipline
  (`ARCHITECTURE.md`'s storage-engine decision log,
  `specs/002-db-technology-migration`) rather than introducing a new
  storage engine or parsing library.
- Consistent with constitution Principle I, all save data this feature
  touches remains read-only input — this feature only ever reads from
  save files to build inventories and populate the database; it never
  writes back to or mutates a save file.
- The real save designated for this feature's completeness testing
  (`Russia (Melted).eu5`, ~642MB) lives outside the repository at a
  local path on the maintainer's machine, not committed — consistent
  with the existing fixture/real-save split (`research-save-format.md`
  was written against a real save that was never committed either, only
  the small hand-composed fixture derived from it was).
