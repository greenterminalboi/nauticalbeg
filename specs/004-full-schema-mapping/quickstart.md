# Quickstart: Validating Full Save-File Schema Mapping (Tooling)

## Prerequisites

- Dependencies installed (`npm install`).
- The designated real save available locally (per spec's Clarifications):
  `Russia (Melted).eu5` (~642MB). Not committed to the repo — supply your
  own local path when running the commands below.

## Scenario 1 — Inventory the real save (User Story 1)

```bash
npm run schema-map -- inventory --save "/path/to/Russia (Melted).eu5" --markdown
```

**Expected**: Exits `0`. Prints a summary line with a section count that
matches jomini's own top-level key count for this save (cross-check:
`Object.keys(root).length` on a raw parse) — not just the ~5 sections
the app currently interprets. A JSON file and a Markdown summary appear
under `tools/schema-mapping/inventories/`. Spot-check the Markdown for:
- `countries` → `database.*.currency_data.gold`, listed as `number`,
  `presence: always`.
- `countries` → `database.*.previous_tags`, listed as a list type,
  `presence: sometimes` (not every country has one).
- `provinces` → `database.*.last_month_produced`, classified
  `variable_object`, not a fixed set of named columns.
- At least one section that has never been manually researched before
  (e.g. `population`) present with real entries, not just a raw dump.

## Scenario 2 — Inventory the committed fixture (regression baseline)

```bash
npm run schema-map -- inventory --save tests/fixtures/rus-1628-minimal.eu5 --out /tmp/fixture-inventory.json
```

**Expected**: Exits `0`. Confirms the tool runs against the small fixture
too, independent of the real save — this is what the automated fixture
test (Clarifications) exercises in CI, without needing the real save
file to be present.

## Scenario 3 — Determinism (Acceptance Scenario 5)

Run Scenario 1's command twice, diff the two output JSON files.

**Expected**: Byte-identical (or, if timestamps are embedded, identical
apart from `generatedAt`) — confirms the walker's output doesn't depend
on object-key iteration order or any non-deterministic sampling.

## Scenario 4 — Apply a finding to the real schema (User Story 2)

Pick one section Scenario 1 flagged as newly inventoried (e.g.
`population`). Follow this project's existing fixture-first workflow:
1. Extend `tests/fixtures/rus-1628-minimal.eu5` with a real, verbatim
   excerpt covering the field(s) being added (matching
   `research-save-format.md`'s existing fixture-composition method).
2. Write a failing fixture-based regression test in
   `tests/parser/adapter.test.ts` asserting the new column(s)' expected
   values.
3. Add the column(s) to `src/storage/schema.sql`.
4. Extend `src/parser/version-adapters/1.3.11.ts` to populate them.
5. Confirm the test now passes.

**Expected**: The previously-opaque field is now a real, individually
queryable DuckDB column — verifiable with a direct `SELECT` against the
resulting database, no JSON-blob parsing required (SC-003).

## Scenario 5 — Drift detection (User Story 3)

```bash
cp tests/fixtures/rus-1628-minimal.eu5 /tmp/modified.eu5
# hand-edit /tmp/modified.eu5: rename one field, remove another, change
# a third's value from a number to a quoted string
npm run schema-map -- inventory --save tests/fixtures/rus-1628-minimal.eu5 --out /tmp/baseline.json
npm run schema-map -- inventory --save /tmp/modified.eu5 --out /tmp/candidate.json
npm run schema-map -- diff --baseline /tmp/baseline.json --candidate /tmp/candidate.json
```

**Expected**: The Drift Report names exactly the three deliberately
introduced changes (one addition, one removal, one type change) and
nothing else — `hasDrift: true`. Re-running `diff` with `--baseline` and
`--candidate` pointed at the *same* file MUST report `hasDrift: false`
explicitly, not an empty/ambiguous result (Acceptance Scenario 3).

## Definition of Done for this quickstart

- [ ] Scenario 1 run against the real save, Markdown spot-checked.
- [ ] Scenario 2 passes as an automated test (no manual real-save step).
- [ ] Scenario 3's determinism check passes.
- [ ] Scenario 4 completed for at least one previously-uninterpreted
      section, with a real committed fixture + test.
- [ ] Scenario 5's synthetic drift test passes.
