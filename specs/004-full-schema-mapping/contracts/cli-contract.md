# Contract: Schema Mapping CLI

This feature exposes one interface: a maintainer-invoked command-line
tool, in two modes (`inventory` and `diff`). There is no HTTP API, no
UI. This document is the contract for its invocation, exit behavior, and
output — what a maintainer (or a task in `tasks.md`) can rely on.

## Mode 1: `inventory` (User Story 1)

```bash
npm run schema-map -- inventory --save <path-to-save-file> --out <path-to-inventory.json>
```

- `--save <path>` (required): path to an EU5 save file (`.eu5`). Read
  only — the tool MUST NOT write, move, or delete anything at this path
  (constitution Principle I).
- `--out <path>` (optional): where to write the resulting Save Inventory
  JSON (data-model.md's `SaveInventory` shape). Default:
  `tools/schema-mapping/inventories/<save-basename>.json`.
- `--markdown` (optional flag): also write a human-readable Markdown
  summary alongside the JSON, generated from it (research.md §4) —
  default: `<out-path-without-extension>.md`.

### Exit behavior

| Condition | Exit code | Output |
|---|---|---|
| Success | `0` | The Save Inventory JSON written to `--out` (and the Markdown summary, if `--markdown` was passed); a summary line printed to stdout: section count, total field-path count, and a count of sections whose shape could not be confirmed (empty in this sample). |
| `--save` path missing or not a readable file | non-zero | Clear, actionable error naming the path. No output file written. |
| The file at `--save` doesn't parse as a save (jomini throws, or the parsed result has no top-level `metadata` — reusing the same signal `src/parser/version-adapters/1.3.11.ts` already checks) | non-zero | Clear, actionable error. No output file written. |

## Mode 2: `diff` (User Story 3)

```bash
npm run schema-map -- diff --baseline <path-to-inventory.json> --candidate <path-to-inventory.json>
```

- `--baseline <path>` / `--candidate <path>` (both required): paths to
  two previously-generated Save Inventory JSON files (this tool's own
  `inventory` mode output — not raw save files).
- `--out <path>` (optional): where to write the resulting Drift Report
  JSON. Default: printed to stdout only, not written to a file.

### Exit behavior

| Condition | Exit code | Output |
|---|---|---|
| Success, drift found | `0` | The Drift Report (data-model.md's `DriftReport` shape) printed to stdout (and written to `--out`, if given), listing every addition/removal/type-change. |
| Success, no drift found | `0` | An explicit "no drift found" report — never an empty or ambiguous result (spec's Acceptance Scenario 3). Same exit code as drift-found: this is a successful comparison either way, not a failure condition. |
| Either input path missing, unreadable, or not a valid Save Inventory JSON (fails `SaveInventory` shape validation) | non-zero | Clear, actionable error naming which input and why. |

## Non-goals of this contract

- No network access is required or performed.
- No interaction with `src/storage/`'s DuckDB connection lifecycle or
  any live app database — `inventory` mode only ever reads a save file
  and writes JSON/Markdown; it never opens a `SaveDatabase`. (User Story
  2's separate `schema.sql`/adapter changes are ordinary application code
  changes, not part of this CLI.)
- No stdin interaction; all input comes from CLI flags and the
  filesystem, so both modes are safe to run non-interactively.
- Neither mode requires a local EU5 game installation (unlike
  `tools/map-generation`, which does) — only a save file, or previously
  generated inventory JSON files.
