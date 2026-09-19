# Implementation Plan: Province Map Generation

**Branch**: `003-province-map-generation` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-province-map-generation/spec.md`

## Summary

A one-time, maintainer-run CLI tool that reads a local EU5 installation's
own map data (`game/in_game/map_data/locations.png` +
`named_locations/00_default.txt` + `definitions.txt` — confirmed present
and inspected directly, see `research.md`) and produces two committed
TopoJSON assets: `public/map/provinces.topojson` (both a `provinces`
layer and a `locations` layer, sharing arcs) and `public/map/
locations.topojson` (the `locations` layer alone) — describing every
province's *and* every location's real shape and position, since a
province is simply a named union of locations (research.md §9). Each
feature is keyed by its name string — the same value the save parser
already stores as `provinces.name` for provinces — rather than by
attempting to replicate the save's numeric `idx` (research.md §2 explains
why that would be an unverifiable guess). Locations have no equivalent
save-schema join key yet (research.md §9's documented gap). Nothing about
parsing, storage, or the running web app changes; this is pure input (a
local game install) → output (static files) tooling, developed and
testable fully independently of the concurrent SQLite→DuckDB storage
migration. A second, small piece validates that output visually: a
minimal, unbundled demo page (dev-server only, not part of the shipped
app) that decodes the asset and renders every province's and every
location's border with pan/zoom, so shape accuracy can be checked across
the whole map instead of a handful of spot-checks.

## Technical Context

**Language/Version**: TypeScript, run via `tsx` (new devDependency) — matches the repo's existing TS/Vite stack rather than introducing a second language for a one-off tool.

**Primary Dependencies**: `pngjs` (new devDependency, pure-JS PNG decode — no native/GDAL bindings, per research.md §4), `tsx` (new devDependency, runs the CLI script directly without a separate build step), `topojson-server` + `topojson-simplify` (new devDependencies, pure-JS topology-building and arc simplification, per research.md §3-4), and `topojson-client` — a real (non-dev) dependency, since both the generation script's self-validation *and* the demo page (research.md §7) decode the asset with it, and the demo page runs in the browser. No pan/zoom or map-projection library is added for the demo (research.md §7's hand-rolled rationale).

**Storage**: N/A. Reads flat files from a maintainer-supplied local path; writes one static file. Explicitly does not touch `src/storage/` (SQLite/DuckDB) — see Constitution Check.

**Testing**: `vitest` (already in use). Unit tests for the color-region grouping, boundary-tracing, and province-grouping logic run against tiny synthetic fixtures (a small hand-built PNG + small `named_locations`/`definitions.txt` excerpts), not the real 134M-pixel bitmap — mirrors `tests/parser`'s fixture-first pattern.

**Target Platform**: Node.js CLI (maintainer's local machine) for generation; the demo page runs in an evergreen browser but only via the existing Vite dev server, never a production build. Real end-user browser consumption of the asset remains a future feature's concern.

**Project Type**: Single dev-tooling script (CLI) plus one small dev-only demo page, both separate from the web app's `src/` tree.

**Performance Goals**: No hard runtime budget — this is a maintainer-triggered, infrequent, offline run (spec FR-004/FR-009), not a user-facing operation gated by constitution Principle V. Soft target: completes well under a few minutes on a typical dev machine against the real ~134M-pixel bitmap, so re-running after a game update stays practical.

**Constraints**: Pure JS/TS, no native dependencies (research.md §4); must never write to the supplied `--install` path (read-only input); output file size should stay reasonable for a committed repo asset (soft target: comfortably under the low tens of MB — TopoJSON's shared-arc encoding, chosen specifically for this per research.md §3, plus simplification, are what's expected to get there; exact simplification tolerance is an implementation detail per the asset contract).

**Scale/Scope**: Confirmed against the real install (research.md §1): a 16384×8192 (~134M pixel) source bitmap, 28,225 named/paintable locations, 28,573 total location definitions, aggregated into however many named provinces `definitions.txt` groups them into (save-side reference: 3,296 `provinces.database` entries in a real save, per `specs/001-save-import-overview/research-save-format.md` — same order of magnitude expected, not required to match exactly).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still holds.*

| Principle | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | ✅ Pass | This feature never touches a save file at all. Its input (the local game install) is read-only by contract (`contracts/cli-contract.md`) — the tool never writes into the install path. |
| II. Parser Correctness & Test-First Fixtures | ✅ Pass (by analogy) | Not literally "save format" parsing (the NON-NEGOTIABLE wording is scoped to that), but the same discipline is applied voluntarily: tiny committed synthetic fixtures + regression tests for the color-region/boundary-tracing logic before the pipeline is trusted (see Testing above and `tasks.md`). |
| III. Explicit Format-Version Compatibility | ✅ Pass | The output asset embeds `generated_from_game_version` (data-model.md) specifically so a future consuming feature can detect a version mismatch against a loaded save rather than silently assuming the asset always matches. |
| IV. Accurate, Unembellished Representation | ✅ Pass | Geometry is derived directly from the game's own pixel data, not estimated/interpolated/placeholder shapes (spec SC-003). Skipped/unmatched locations are reported, not silently dropped (FR-008). |
| V. Performance & Scalability for Large Saves | N/A | This feature has no runtime/UI component; it doesn't parse or render a save. Deferred to whichever future feature renders this asset. |
| VI. Visualization Clarity & Accessibility | N/A | The demo page (User Story 2) is dev-only validation tooling, never shipped or reachable in the built app (spec FR-011), so it isn't the kind of product-facing visualization this principle governs. Real accessibility/clarity work is deferred to the future "Map" tab feature, as spec.md's Assumptions state explicitly. |
| VII. Simplicity & Incremental Scope | ✅ Pass | Single script, single output file, no plugin system or generic multi-game abstraction — built for exactly the current need. |
| VIII. Grounded AI Query Agent | N/A | No agent involvement in this feature. |
| Technical Constraints — no Paradox asset redistribution | ⚠️ Documented exception | See Complexity Tracking below. |

**Gate result**: PASS, with one explicitly documented and owner-approved exception (asset redistribution — not a violation being smuggled through, a deliberate scope decision).

## Project Structure

### Documentation (this feature)

```text
specs/003-province-map-generation/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   ├── cli-contract.md
│   └── map-asset-schema.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
tools/
└── map-generation/           # New — Node-only CLI, never bundled into the browser app
    ├── generate.ts            # CLI entrypoint: arg parsing, orchestration, exit codes (contracts/cli-contract.md)
    ├── read-locations-bitmap.ts   # Decode locations.png (pngjs); group pixels by exact color
    ├── read-named-locations.ts    # Parse named_locations/*.txt → name→color map
    ├── read-definitions.ts        # Parse definitions.txt's region/area/province tree → province→[location names]
    ├── trace-polygons.ts          # Moore-neighbor boundary trace → raw Polygon/MultiPolygon rings (no simplification here — see write-topology.ts)
    ├── project.ts                 # Pixel (x,y) → equirectangular [lon, lat] (research.md §3)
    ├── write-topology.ts          # buildCombinedTopology (provinces+locations, one arc-sharing topology()) + buildLocationsOnlyTopology (locations alone); both simplify (topojson-simplify), validate by decoding (topojson-client), then writeTopologyFile
    ├── types.ts                   # Shared types (data-model.md's pipeline entities)
    └── demo/                      # New — dev-only validation viewer (User Story 2), never in the production build
        ├── index.html              # Second, unbundled Vite HTML entry — open via the dev server, not linked from the real app
        └── main.ts                 # fetch()es /map/provinces.topojson, decodes both objects via topojson-client, renders both layers + pan/zoom (research.md §7)

public/
└── map/
    ├── provinces.topojson     # New — provinces + locations layers, committed to the repo (Constitution Check exception)
    └── locations.topojson     # New — locations layer alone, committed to the repo (same exception)

tests/
└── map-generation/           # New — mirrors tests/parser's fixture-first pattern
    ├── fixtures/               # Tiny synthetic PNG + named_locations/definitions.txt excerpts
    ├── read-locations-bitmap.test.ts
    ├── read-definitions.test.ts
    ├── trace-polygons.test.ts
    ├── write-topology.test.ts
    └── join-with-save.test.ts     # Cross-feature regression: decoded provinces.topojson names join against a real parsed save's provinces.name (spec SC-002)

package.json                  # + "generate:map": "tsx tools/map-generation/generate.ts"
                               # + dependencies: topojson-client
                               # + devDependencies: tsx, pngjs, @types/pngjs, topojson-server, topojson-simplify
```

**Structure Decision**: A new top-level `tools/` directory, sibling to
`src/` and `tests/`, holds this feature entirely, including its demo
page. Nothing in `src/` (parser, storage, domain, components) is
modified — the feature is additive-only at the repo level, which is what
makes it safe to build in parallel with the DuckDB migration touching
`src/storage/`. Output lands in Vite's standard `public/` directory (new
to this repo, but a zero-config standard location) since it's a static
asset a future browser feature will `fetch()`, not app source. The demo
page is deliberately *not* added to the production build's entry points
or the React app's routing (per spec FR-011) — it's reached directly via
the Vite dev server during development, the same way any other loose
`.html` file under the project root would be.

## Complexity Tracking

> Documented, owner-approved exception (not a violation needing
> alternative justification per se, but recorded here per Governance's
> "any deviation MUST be explicitly justified" rule).

| Deviation | Why Needed | Simpler/Compliant Alternative Rejected Because |
|---|---|---|
| Committing Paradox-derived map geometry (`public/map/provinces.topojson`) to the repo, shipped to all users, vs. the constitution's "sourced from the user's own installation" framing | The future Map-tab feature needs real province geometry to render for every user of the deployed app, not just maintainers who happen to own a local EU5 install and run this tool themselves | Keeping the asset local/gitignored (never committed) was considered and explicitly rejected by the project owner when this feature was scoped — it would leave the deployed web app with no real map data at all, deferring the actual problem rather than solving it. The owner's judgment (recorded in research.md §8): derived vector *boundaries* (positional/geometric facts) are distinct from the copyrighted textures/art the constraint exists to guard against, and are an acceptable, deliberate exception. |
