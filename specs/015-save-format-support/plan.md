# Implementation Plan: Save Format Support (Compressed & Ironman Saves)

**Branch**: `015-save-format-support` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-save-format-support/spec.md`

## Summary

Accept every EU5 save format: uncompressed and compressed, text and binary
(ironman/normal/multiplayer). The save header's format code routes every
non-plain-text save through a new in-browser **melter**. The melter is a
~240KB Rust→WASM module built from rakaly/jomini's MIT-licensed `eu5save`
crate, fed pdx.tools' EU5 token table (used with permission). It turns
the save into the same plaintext the existing pipeline already parses.
`detectVersion`, the `1.3.11` adapter, DuckDB ingestion and every tab stay
unchanged.

The planning spike proved this end to end on the real 84MB multiplayer
save: melting took 5.6s in WASM with **0 unknown tokens**, and the output
matches rakaly's melt line-for-line apart from quoting style. That was
after two real issues were found and fixed:
- a token-ID mapping bug around the table's 9999 breakpoint (research R3)
- one version-drift token rename, `unused_strength` → `strength` (research R4)

## Technical Context

**Language/Version**: TypeScript 5.x (app, strict); Rust 2024 edition, stable 1.94 via rustup (melter crate only)

**Primary Dependencies**: existing jomini (npm, text parser), DuckDB-Wasm, React 19, Vite. New build-time deps: `eu5save` + `jomini` Rust crates (MIT, git-pinned to `rakaly/jomini@4461f6e`), `wasm-bindgen` 0.2.128. No new npm runtime dependency.

**Storage**: DuckDB-Wasm on OPFS. Unchanged; no schema change.

**Testing**: vitest (+ jsdom) for TS; `cargo test` for the melter crate (token mapping, quoting patch, fixture encoder)

**Target Platform**: Evergreen browsers (Chrome primary), in a dedicated Web Worker

**Project Type**: Client-only web application

**Performance Goals**: Real 84MB compressed-binary save loads in ≤1.5× the time of its 642MB melted-text counterpart (SC-003). Melting itself is ~5–6s. Plain text saves regress ≤5% (SC-004), which holds because they skip the melter entirely.

**Constraints**: Peak memory ≤1.5× the melted-text load (streamed melt output, per-load melter instance: research R8); progress at least once per second through the melt; no save bytes leave the device; a decompressed-size cap of 2GB

**Scale/Scope**: One new WASM module, one token asset + override map, three generated fixtures, and changes to `load-save.ts`, `version-detect.ts`, `protocol.ts` and the loader UI's messages/warning

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Read-only, client-side | ✅ | Melting runs in the parser Worker on bytes already read; the original file is never written; no network use besides fetching our own static assets |
| II. Test-first fixtures (NON-NEGOTIABLE) | ✅ | Three generated binary/zip fixtures + equivalence tests are written before `load-save.ts` routing changes (R7). Unknown tokens/lookups become a visible warning, never a silent drop (FR-009) |
| III. Explicit version compatibility | ✅ | Format routing uses the explicit header code; unknown codes → `unrecognized-format`. Token overrides are selected by the detected game version; the adapter registry is unchanged |
| IV. Accurate representation | ✅ | Quoting patch (R5) prevents corrupted `Custom_Name` values; the `strength` override (R4) prevents silently empty regiment strength |
| V. Performance | ✅ | Worker-only, streamed output, per-second progress with a new `decompressing` phase |
| VII. Simplicity | ✅ | One parse path (melt → existing text pipeline), not a second, binary-native parser |
| Tech constraint: no Paradox art/assets | ✅ | The token table is a list of internal identifier strings: factual data, like the Encyclopedia exception. Shipped under the permission recorded in spec.md, with provenance documented next to the file |
| Architecture: parser/visualization decoupling | ✅ | Everything new lives under `src/parser/`; the only UI touch is rendering the new error kinds and the `warnings` field |
| Security: malformed input can't crash the tab | ✅ | WASM traps are caught → `damaged-save`; decompression is size-capped |

**Post-design re-check**: Still passes. The design adds three
`ErrorKind`s and an optional `warnings` field to `ready`. The worker
protocol contract is extended, with backward-compatible additions only.

## Project Structure

### Documentation (this feature)

```text
specs/015-save-format-support/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── melter-wasm.md          # Rust↔JS melter interface
│   └── worker-protocol-delta.md # additions to 001's worker contract
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
tools/eu5-melter/                     # NEW Rust crate (not shipped; builds the WASM)
├── Cargo.toml                        # eu5save/jomini git-pinned, wasm-bindgen 0.2.128
├── patches/eu5save-quote-lookups.patch   # R5 upstream-bug patch
├── src/lib.rs                        # #[wasm_bindgen] melt / melt_metadata
├── src/tokens.rs                     # flat-table reader + version overrides (R3/R4)
├── src/encode.rs                     # test-only text→binary encoder (R7, cfg(feature="encoder"))
├── src/bin/make-fixtures.rs          # generates tests/fixtures/*.eu5 variants
└── build.sh                          # cargo (rustup PATH) + wasm-bindgen --target web

src/parser/
├── save-format.ts                    # NEW: header → SaveFormat (R1)
├── melter/
│   ├── melt.ts                       # NEW: load WASM + tokens, streamed melt, error mapping
│   ├── token-overrides.ts            # NEW: per-game-version overrides (R4)
│   └── generated/                    # NEW, committed build output: eu5_melter.js + eu5_melter_bg.wasm
├── load-save.ts                      # CHANGED: route by format, new phases/errors/warnings
├── version-detect.ts                 # CHANGED: looksLikeSaveFile kept; header helpers moved to save-format.ts
├── protocol.ts                       # CHANGED: new ErrorKinds, 'decompressing' phase, ready.warnings
└── worker.ts                         # CHANGED: pass warnings through

public/tokens/
├── eu5.flat                          # NEW: pdx.tools EU5 token table, decompressed (R3)
└── README.md                         # NEW: provenance, permission (2026-09-24), sha256s

src/components/Overview/ErrorMessage.tsx  # CHANGED: copy for the three new error kinds
src/components/Overview/FileLoader.tsx   # CHANGED: show ready.warnings as a non-blocking banner

tests/
├── fixtures/rus-1628-minimal.{bin,zip,ztext}.eu5   # NEW, generated
├── parser/save-format.test.ts                      # NEW
├── parser/melter.test.ts                           # NEW (Node initSync)
└── parser/load-save.test.ts                        # CHANGED: equivalence across all formats
```

**Structure Decision**: Single client-only project, as before. The Rust
crate lives under `tools/`, like the other generators. Its output is
committed so the app needs no Rust toolchain to build, test or run.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A Rust→WASM build step in a TS-only repo | The only permissively-licensed EU5 binary decoder is the Rust `eu5save` crate | Porting the binary lexer + EU5 flavor + envelope to TS means re-implementing ~3k lines of upstream code and keeping it in sync; using pdx-tools' WASM is AGPL |
| Carrying a local patch on an upstream crate | Upstream melt writes space-containing lookup strings unquoted (R5) | Leaving it corrupts values (Principle IV); also filed upstream so the patch can be dropped later |
