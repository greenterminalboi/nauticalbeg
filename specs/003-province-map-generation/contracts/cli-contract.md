# Contract: Generation CLI

This feature exposes one interface: a maintainer-invoked command-line
script. There is no HTTP API, no UI. This document is the contract for
its invocation, exit behavior, and output — what a maintainer (or a task
in `tasks.md`) can rely on.

## Invocation

```bash
npm run generate:map -- --install <path-to-eu5-install>
```

- `--install <path>` (required): path to a local EU5 game installation
  root (the directory containing `game/in_game/map_data/`, per
  research.md §1). Read-only — the pipeline MUST NOT write, move, or
  delete anything under this path (constitution Principle I's spirit).
- `--out <path>` (optional): combined (provinces + locations) output file
  path. Default: `public/map/provinces.topojson` (repo-relative).
- `--out-locations <path>` (optional): locations-only output file path.
  Default: `public/map/locations.topojson` (repo-relative).
- `--game-version <string>` (optional, default `"unknown"`): recorded
  verbatim into both outputs' `generated_from_game_version` property
  (data-model.md's Output entities). No install file reliably exposes the
  game's version as plain text (research.md §6's implementation update),
  so the maintainer supplies it directly — e.g. the version shown in the
  game's own launcher/main menu.

## Exit behavior

| Condition | Exit code | Output |
|---|---|---|
| Success | `0` | Both output files written (at `--out`/`--out-locations`, or their default paths); a summary line printed to stdout: province and location counts written, unpaintable-location count skipped (FR-008). |
| `--install` path missing, or doesn't contain `game/in_game/map_data/` | non-zero | Clear, actionable error identifying exactly what was expected and not found (FR-007). Neither output file is written or overwritten. |
| A required map-data file is present but unparseable (e.g. `locations.png` isn't a valid PNG, `definitions.txt` doesn't match the expected `region { area { province = { ... } } }` shape) | non-zero | Clear, actionable error naming the file and the specific parse failure. Neither output file is written or overwritten. |
| Output validation fails post-generation (data-model.md's validation rules) | non-zero | Clear error naming which validation rule failed, and which file/object it applies to. Neither output file is written (a failed run MUST NOT leave a partially-written or invalid asset in place — this includes not leaving one of the two files updated while the other failed). |

## Idempotency

Re-running the command with the same `--install` input and the same
version of this tool MUST produce functionally-identical output files
(same `province_count`/`location_count`, same set of feature `name`s,
equivalent geometry) — per spec SC-005. The command always fully
regenerates both files; it never reads or patches a prior output file.

## Non-goals of this contract

- No network access is required or performed.
- No interaction with `src/storage/`, `src/parser/`, or any save file —
  this command's only inputs are the files under the given `--install`
  path.
- No stdin interaction; all input comes from CLI flags and the
  filesystem, so this command is safe to run non-interactively (e.g. from
  a future CI job or npm script) once real fixture-backed tests exist for
  it.
