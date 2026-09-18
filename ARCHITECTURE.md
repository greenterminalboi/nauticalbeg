# Architecture

NauticalBeg is a client-only web app: everything — reading the save file,
parsing it, storing the parsed result, and rendering it — runs in the
browser. There is no backend for this feature (see
`specs/001-save-import-overview/plan.md`).

This document is a living summary; update it (task T039 and beyond)
whenever the as-built design diverges from what's described here.

## Module boundaries

```text
src/
├── parser/       Reads a raw save file and turns it into rows in the
│                 per-save SQLite database. Runs inside a Web Worker so
│                 it never blocks the UI thread.
├── storage/      The only code allowed to touch the SQLite database
│                 (via wa-sqlite/OPFS). Exposes a narrow, typed,
│                 read-mostly query API — see contracts/data-access-contract.md.
├── domain/       Pure logic that sits between storage and the UI (e.g.
│                 aggregation helpers that don't belong in either).
└── components/   React UI. Only ever calls storage/queries.ts — never
                  touches the parser or the database directly.
```

The `parser` → `storage` → `components` boundary is deliberate and
enforced by convention (not by a build-time rule yet): the UI must not
know how a save was parsed, and the parser must not know how its output
will be displayed. This is what constitution Principle VIII (the future AI
copilot) depends on — the same `storage/queries.ts` interface that powers
the overview UI today is meant to be the interface the AI agent's
tools call later, unchanged.

## Data flow

```text
File (user's disk)
  │  File.slice() → raw bytes (Uint8Array), in the worker (never the main thread)
  ▼
parser/save-reader.ts → parser/version-detect.ts → parser/version-adapters/*
  │  jomini (WASM) parses the bytes; writes rows as it goes
  ▼
storage/db.ts (wa-sqlite, OPFS-backed SQLite database, one per save)
  │  read-only, parameterized queries
  ▼
storage/queries.ts  ──►  components/ (React UI)
```

See `specs/001-save-import-overview/contracts/worker-protocol.md` for the
exact main-thread ↔ worker message shapes, and
`specs/001-save-import-overview/data-model.md` for the database schema.

## Why SQLite instead of plain JS objects

EU5 saves run 500-600MB uncompressed. Holding that as one big in-memory
object graph risks exhausting browser memory, and doesn't give a query
interface. `wa-sqlite` over OPFS avoids both problems — see
`specs/001-save-import-overview/research.md` §2 for the full tradeoff
analysis and `plan.md`'s Complexity Tracking for why this is justified now
rather than deferred.

## Cross-origin isolation requirement

`wa-sqlite`'s OPFS-backed VFS needs `SharedArrayBuffer`, which browsers
only expose in a cross-origin-isolated context. `vite.config.ts` sets the
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers for the dev server;
any production static host must set the same two headers, or the storage
layer will fail to initialize. This was discovered during T010
implementation and is worth remembering when choosing a hosting provider
later — not every static host lets you set custom response headers.

## Save format parsing: jomini, not a hand-rolled tokenizer

The parser (`version-adapters/*`) is built on
[`jomini`](https://github.com/nickbabcock/jomini) (npm, MIT license),
not a hand-rolled tokenizer. This was a deliberate switch made mid-project
after discovering it: `jomini` is a Rust library compiled to WASM,
specifically built for this exact Paradox save format, and is the same
engine behind [pdx.tools](https://pdx.tools) (an existing EU4/EU5/CK3/etc.
browser save analyzer — pdx.tools itself is AGPL-3.0 and not usable here,
but the underlying `jomini` crate/npm package is separately MIT-licensed
and explicitly designed to be embedded elsewhere). Compared to the
original hand-rolled recursive-descent tokenizer it replaced: ~200MB/s
native parsing speed, <100KB gzipped, and it already correctly handles
real-save quirks (e.g. a literal `"=="` used as a dictionary key, or an
object used as a map key) that the hand-rolled version had to be patched
for one at a time via direct testing against a real save. Verified against
the complete real 653MB save end to end (not just the fixture): parses in
~17 seconds.

`version-detect.ts`/`version-adapters/*` take raw bytes (`Uint8Array`),
never a decoded string — `jomini` parses bytes directly, and this isn't
just a performance choice: V8 has a hard string-length ceiling (~536M
UTF-16 code units in the Node version used for testing) well below a real
save's size, confirmed by hitting it directly. A `Uint8Array` has no such
ceiling in practice, so `save-reader.ts` never decodes to a JS string.

One real gotcha worth knowing if you touch this code: `jomini`'s
`typeNarrowing` option auto-converts date-shaped values to JS `Date`
objects. With the default (`"all"`), it misidentifies the quoted version
string `"1.3.11"` as a date and mangles it — using `typeNarrowing:
"unquoted"` avoids this (quoted strings are left alone; genuinely-unquoted
dates like `date=1628.8.14` still narrow correctly). Every call site uses
`"unquoted"` for this reason.

## Capturing sections we don't understand yet

The parser doesn't only extract the 5 sections this feature's overview
needs (`metadata`, `countries`, `provinces`, `locations`, `war_manager`).
Every top-level section in the save gets parsed and, if it doesn't have a
real table, stored as opaque JSON in `raw_sections` (see
`specs/001-save-import-overview/data-model.md`). This is a deliberate
choice — made explicitly, not by default — to avoid losing data that
future features (map visualization, time-series, the AI copilot) will
likely need, without guessing at schemas for the ~45 sections nobody has
researched yet (constitution Principle II). Known cost: more parse
time/storage than this feature strictly requires; accepted for now,
revisit if it proves too slow (in practice, ~17s for the full real save,
comfortably under the 60s target). `jomini`'s own docs note that 95-99% of
parse cost is JS-object creation, and that its `query.at()`/callback API
can skip building objects for paths not requested — a real future
optimization if full materialization ever does prove too slow.

## Save-format knowledge

The EU5 save format is undocumented. What we've learned from real save
files, adapter by adapter, lives in code comments next to each
`parser/version-adapters/*` entry and in its accompanying fixture test —
per constitution Principle II, that knowledge must be encoded in
version-controlled fixtures/tests, not left as tribal knowledge.

## Persistence model

A save is session-only by default (in-memory/temporary OPFS storage,
cleared when the tab closes). If the user chooses to "keep" it
(`storage/queries.ts` → `keepSave`), its database persists in OPFS across
browser sessions. Only one save may be kept at a time in v1 — keeping a new
one deletes the previous kept database. See
`specs/001-save-import-overview/data-model.md`'s state-transition diagram.
