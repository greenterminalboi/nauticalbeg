# Architecture

NauticalBeg is a client-only web app: everything — reading the save file,
parsing it, storing the parsed result, and rendering it — runs in the
browser. There is no backend for this feature (see
`specs/001-save-import-overview/plan.md`).

This document is a living summary; update it whenever the as-built design
diverges from what's described here.

## Module boundaries

```text
src/
├── parser/       Reads a raw save file and turns it into rows in the
│                 per-save SQLite database. Runs inside a Web Worker so
│                 it never blocks the UI thread. Also owns the "keep"/
│                 "resume" worker-protocol handlers — see below for why
│                 those live here too, not just parsing.
├── storage/      The only code allowed to touch the SQLite database
│                 (via wa-sqlite/OPFS). Exposes a narrow, typed,
│                 read-mostly query API — see contracts/data-access-contract.md.
├── domain/       Currently empty. Reserved for pure logic that would sit
│                 between storage and the UI, but nothing needed it yet —
│                 every aggregation this feature needs lives directly in
│                 storage/queries.ts's SQL (constitution Principle VII:
│                 don't build the abstraction before something needs it).
├── styles/       Design tokens (colors/typography/spacing) as CSS custom
│                 properties, sourced from design.md's "Imperial
│                 Illuminator" system. One global stylesheet, imported
│                 once from main.tsx; component-scoped CSS files
│                 (co-located with each .tsx) reference these tokens
│                 rather than repeating literals.
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
  │
  ├─ write-capable connection ── stays in the Worker (parsing, keepSave)
  │
  └─ read-only connection ────── opened by the main thread once per
                                  "ready" session, kept open across
                                  nation-selector changes (FileLoader.tsx's
                                  readDbRef), closed on supersede/unmount
  ▼
storage/queries.ts  ──►  components/ (React UI)
```

See `specs/001-save-import-overview/contracts/worker-protocol.md` for the
exact main-thread ↔ worker message shapes (now covering `load`, `cancel`,
`keep`, and a `load` variant that resumes a kept save instead of parsing),
and `specs/001-save-import-overview/data-model.md` for the database
schema.

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

## Writes to the database MUST happen inside the Worker

This is the single most important constraint discovered after building
the initial parser (confirmed by reproducing the exact crash in Chrome,
twice, in different forms — see below): **a write-capable SQLite
connection to an OPFS-backed database can only be opened from within a
dedicated Worker in this browser.** A plain `openSaveDatabase()` call
(read-write, no special flags) from the main thread fails outright —
`fileEntry.fileHandle.createSyncAccessHandle is not a function` — before
any actual write statement even runs, because SQLite's locking protocol
requires briefly acquiring an exclusive lock even to *open* a read-write
connection, and `createSyncAccessHandle()` (which the OPFS VFS needs for
that) isn't available outside a Worker here.

Two concrete consequences baked into the code as a result:

- **`storage/db.ts`'s `openSaveDatabase` takes a `readonly` option.**
  Every main-thread caller (`FileLoader.tsx`'s post-parse/post-resume read,
  `cleanupSaveIfNotKept`'s kept-flag check) passes `readonly: true`. A
  read-only connection never needs more than a shared lock, so it never
  hits the exclusive-lock path. Reads that genuinely never write are safe
  from either context; anything that writes is not.
- **"Keep a save" is a worker-protocol round trip, not a direct function
  call.** `KeepSaveToggle.tsx` can't just call a `keepSave(db, saveId)`
  function against its own connection — it posts a `keep` message to the
  existing parser Worker, which opens its own (write-capable) connection,
  runs the write, and reports back `kept`/`keep-failed`. `forgetKeptSave`
  is the one exception that *is* safe to call directly from the main
  thread: it never opens SQLite at all, only OPFS directory entries via
  `navigator.storage`.

## `localStorage` doesn't exist inside a Worker

A second, unrelated surprise found while wiring up "keep": `localStorage`
is a `Window`-only API. It doesn't exist in a dedicated Worker's global
scope at all — code that assumes otherwise doesn't fail to compile, it
throws `localStorage is not defined` the first time it actually runs
there. `storage/queries.ts`'s original combined `keepSave(db, saveId)`
did exactly this once its SQL-writing half was moved into the worker (per
the constraint above). It's now split: `markSaveKept(db, saveId)` (the SQL
write, worker-safe) and `recordKeptSave(summary)` (the `localStorage`
"which save is kept" pointer, main-thread-only, called from
`FileLoader.tsx` once the worker's `kept` ack arrives). `keepSave` itself
still exists, composing both, purely for same-thread test callers where
the split doesn't matter.

## Concurrent queries on one connection corrupt it

wa-sqlite's async build runs on Asyncify, which unwinds/rewinds a single
WASM call stack per module instance — it does not support two
in-flight async SQLite calls against the same connection at once.
`FileLoader.tsx` originally fetched `getSaveMeta` and
`getPlayerNationOverview` via `Promise.all`, which corrupted that shared
state; the exact symptom varied by run (a nonsensical "no such table"
error, an OPFS `NotFoundError`, or an outright WASM "memory access out of
bounds" crash) depending on how the race landed. No unit test caught this
— every existing test calls one query at a time — it only showed up
running the real Worker/UI flow in a browser. **Rule going forward: never
run more than one query concurrently against the same open
`SaveDatabase`.** Sequential `await`s, even against the same connection,
are fine and is what every call site does now.

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

## The "pick an entity, view it" pattern (nation selector and beyond)

Once a save is loaded, the overview isn't locked to the player's own
nation. `storage/queries.ts` exposes `listNations(db)` (every real nation)
and `getNationOverview(db, nationIdx)` (any one of them, by index) as the
general-purpose pair; `getPlayerNationOverview` is now a thin wrapper that
just looks up the player's `idx` and delegates. `NationSelector.tsx` is
deliberately generic (`{ items, selectedIdx, onSelect }`-shaped, not
nation-specific in spirit) for the same reason: this `list*` +
`get*ByIdx` pattern, backed by the one long-lived read-only connection
described above, is meant to generalize to future selectable views (e.g.
provinces), not stay a one-off nation dropdown.

## Persistence model

A save is session-only by default: the worker writes into a new
OPFS-backed database on every load, and it's deleted — via
`cleanupSaveIfNotKept` — either when a new load supersedes it or on tab
close (`beforeunload`, best-effort only; see that function's own doc
comment for why it can't be guaranteed). If the user chooses to "keep" a
save, that deletion is skipped and the database persists in OPFS across
browser sessions instead.

"Keep" itself is two steps split across two JS contexts (see the Worker
constraints above): `markSaveKept` (in the worker) sets
`save_meta.kept = 1`, and `recordKeptSave` (on the main thread, once the
worker acks) writes a small `localStorage` pointer
(`nauticalbeg.keptSave`) recording which save that is — there's no other
cheap way to answer "which save is kept" across separate per-save
database files without scanning OPFS. Only one save may be kept at a time
in v1 (Assumptions) — keeping a new one deletes the previous kept
database, but only *after* the new save's own write succeeds, so a
failure (most notably hitting a storage quota, FR-014) never destroys a
still-valid previous kept save.

On startup, `FileLoader.tsx` checks `listKeptSave()` and, if one exists,
offers to resume it (`KeptSaveOffer.tsx`) instead of requiring a fresh
upload. Resuming (`resumeSave` in `parser/load-save.ts`) reopens the
already-parsed database directly by id and skips file-reading/version-
detection/parsing entirely — it reuses the exact same `ready`/`error`
worker-protocol messages a fresh load produces, so the UI code that
handles "a save became ready" needed no special-casing for "was this
parsed just now, or resumed from a previous session."

See `specs/001-save-import-overview/data-model.md`'s state-transition
diagram for the full picture.
