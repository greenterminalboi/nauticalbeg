# Architecture

NauticalBeg is a client-only web app: everything — reading the save file,
parsing it, storing the parsed result, and rendering it — runs in the
browser. There is no backend for this feature (see
`specs/001-save-import-overview/plan.md`).

This document is a living summary; update it whenever the as-built design
diverges from what's described here.

## Storage engine: DuckDB, not SQLite (decision log)

001 and the first two user stories of 002 were originally built on
`wa-sqlite`/OPFS. On 2026-09-18, the storage engine was migrated to
**DuckDB-Wasm**, for two reasons:

1. **Visualization direction.** The project's planned visualization layer
   (J.P. Morgan/FINOS's [Perspective](https://perspective.finos.org))
   works natively with Apache Arrow. DuckDB speaks Arrow as its native
   result format; SQLite would need a manual row→Arrow conversion layer
   at every query boundary.
2. **Query shape.** Later user stories (cross-country aggregation,
   drilling into location-level comparisons) are OLAP-shaped — DuckDB's
   columnar engine fits that better than SQLite's row store.

The rest of this document describes the DuckDB architecture as built. The
migration itself surfaced several real, only-discoverable-in-a-real-
browser findings, called out inline below and summarized here:

- DuckDB-Wasm allows only **one open handle per OPFS file at a time** —
  unlike SQLite, there's no way to have a writer and a reader connection
  open on the same file simultaneously from different contexts.
- DuckDB has **no SQLite-style restriction requiring writes to originate
  from a dedicated Worker** — confirmed by writing successfully from a
  plain browser tab context in a real Chrome session. This let "keep"
  drop its entire worker-round-trip protocol.
- A real-browser spike found DuckDB-Wasm tolerates **concurrent queries
  on one connection** without the Asyncify-style corruption SQLite had —
  but `db.ts` keeps a defensive per-connection queue anyway (see
  "Concurrent queries" below), since that spike didn't specifically cover
  concurrent *prepared statements*.
- OPFS persistence is **not durable without an explicit `CHECKPOINT`** —
  found via two real failures during this migration (see "OPFS
  persistence requires an explicit CHECKPOINT" below).
- DuckDB's `REAL` type is 32-bit float, unlike SQLite's always-64-bit
  `REAL` — found via a real failing test (`27.27` round-tripped as
  `27.270000457763672`). `schema.sql` uses `DOUBLE` for every stat
  column instead.
- The DuckDB-Wasm WASM engine is much larger than wa-sqlite's: the
  one-time runtime download (fetched lazily when a save is first loaded,
  then cached) is roughly 7-9MB gzipped depending on which bundle the
  browser needs, versus wa-sqlite's ~422KB. This is a real, accepted
  tradeoff for the Arrow/OLAP fit above, worth knowing if load time on
  slow connections ever becomes a concern.
- **A row-by-row prepared-statement insert loop (ported verbatim from
  the SQLite version) crashed on a real ~650MB save** with a WASM
  `RuntimeError: memory access out of bounds`, reported live by an
  actual user — see "Bulk inserts: Arrow, not a row-by-row
  prepared-statement loop" below for the fix and the two real
  `insertArrowTable` API gotchas found getting it working.

## Module boundaries

```text
src/
├── parser/       Reads a raw save file and turns it into rows in the
│                 per-save DuckDB database. Runs inside a Web Worker so
│                 it never blocks the UI thread — the parsing Worker owns
│                 its own connection only for the duration of ingestion,
│                 fully closing it (see below) before signaling ready.
├── storage/      The only code allowed to touch the DuckDB database
│                 (via @duckdb/duckdb-wasm/OPFS). Exposes a narrow,
│                 typed, read-mostly query API — see
│                 contracts/data-access-contract.md.
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

## Province map generation (separate from the save-viewing app)

`tools/map-generation/` (see `specs/003-province-map-generation/`) is a
standalone Node CLI, not part of the `src/` module boundary above and
never bundled into the browser app. It reads a local EU5 game
installation's own map files (`locations.png`, `named_locations/*.txt`,
`definitions.txt`) and generates two TopoJSON assets: `public/map/
provinces.topojson` (both a `provinces` layer — one geometry per
province, keyed by the same name string the save parser stores as
`provinces.name` — and a `locations` layer, sharing arcs with the
provinces layer where borders coincide) and `public/map/
locations.topojson` (the `locations` layer alone, for a consumer that
doesn't need province geometry). A province's shape is a union of its
member locations' shapes, not separately sourced. **Locations have no
save-schema join key yet** — `schema.sql`'s `locations` table has only a
numeric `idx`, no `name` column, so the generated location geometry
(keyed by name, like provinces) can be rendered but not joined against
save data until a future feature adds one. Run the generator via
`npm run generate:map -- --install <path> [--game-version <string>]
[--out <path>] [--out-locations <path>]` whenever the game's map data
changes; the committed outputs are the actual deliverable, regenerated
on demand, never at app runtime.

A dev-only demo viewer at `tools/map-generation/demo/` (open
`tools/map-generation/demo/index.html` via `npm run dev`, never part of
the production build) renders both layers with pan/zoom — location
borders thin/light, province borders bolder/dark — useful for visually
sanity-checking a regeneration, not a preview of the eventual "Map" tab
(which still needs real design/coloring/interaction work this demo
deliberately skips).

Two real parsing bugs worth remembering if this pipeline is ever touched
again (both confirmed against the real ~30k-line `definitions.txt` and
`named_locations/00_default.txt`, not fixable by guessing from a sample):
`definitions.txt` mixes `name = {`, `name= {`, and `name={` (inconsistent
spacing around `=`) and contains `#`-prefixed comments that can carry
stray unbalanced braces — both must be handled by the tokenizer, not
assumed away. See `specs/003-province-map-generation/research.md` for the
full account, including why boundary tracing walks graph *edges* (not
vertices) to correctly separate provinces that touch at exactly one pixel
corner.

## Data flow

```text
File (user's disk)
  │  File.slice() → raw bytes (Uint8Array), in the worker (never the main thread)
  ▼
parser/save-reader.ts → parser/version-detect.ts → parser/version-adapters/*
  │  jomini (WASM) parses the bytes; writes rows as it goes, via the
  │  Worker's own DuckDB connection (open only for this ingestion step)
  ▼
storage/db.ts (@duckdb/duckdb-wasm, OPFS-backed, one database per save)
  │
  ├─ ingestion connection ── opened by the Worker, does applySchema +
  │                          every insert, then CHECKPOINTs and fully
  │                          closes *before* the Worker signals ready —
  │                          required because DuckDB allows only one
  │                          open handle per OPFS file at a time
  │
  └─ session connection ──── opened by the main thread once "ready"
                              fires, used for every read AND for the
                              keep-toggle write (no worker round-trip —
                              see below), kept open across nation-
                              selector/tab changes (FileLoader.tsx's
                              readDbRef), closed on supersede/unmount
  ▼
storage/queries.ts  ──►  components/ (React UI)
```

See `specs/001-save-import-overview/contracts/worker-protocol.md` for the
main-thread ↔ worker message shapes (`load`, `cancel` — `keep`/`kept`/
`keep-failed` were removed in the DuckDB migration, see below) and
`specs/001-save-import-overview/data-model.md` for the database schema.

## Cross-origin isolation headers

`vite.config.ts` still sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` — these were originally
required for wa-sqlite's `SharedArrayBuffer` usage. DuckDB-Wasm's `eh`
bundle (the one actually selected in testing, per `selectBundle`'s
feature detection) does not appear to need cross-origin isolation, but
this hasn't been specifically confirmed by removing the headers and
retesting — left in place as a known-working configuration rather than
an unverified simplification. Revisit if choosing a static host that
makes setting these headers awkward.

## DuckDB-Wasm allows only one open handle per OPFS file

A real constraint (not a browser quirk to work around, an actual DuckDB-
Wasm limitation): two separate `AsyncDuckDB` instances cannot both hold
the same `opfs://name` path open at once — attempting it throws "file
already locked exclusively." This shaped two design decisions:

- **The parsing Worker's ingestion connection is short-lived.**
  `parser/load-save.ts`'s `loadSave`/`resumeSave` both open a connection,
  do their work, `CHECKPOINT` and fully close it, and only *then* call
  `onReady` — never signal ready while still holding the file open. If
  `onReady` fired first, the main thread's `FileLoader.tsx` (which opens
  its own connection the moment `ready` arrives) could race the Worker's
  own close and hit the same "already locked" error in production.
- **There is exactly one long-lived connection per session**, owned by
  the main thread once a save is ready, used for every read and for the
  keep-toggle write. No separate "write connection" exists anymore.

## "Keep" no longer needs a Worker round-trip

Under SQLite, opening a write-capable OPFS connection from the main
thread crashed outright (`createSyncAccessHandle is not a function`),
which forced "keep" into a `keep`/`kept`/`keep-failed` worker-protocol
round-trip, itself complicated by `localStorage` not existing inside a
Worker's global scope at all. Neither restriction exists for DuckDB —
confirmed by writing directly from a plain browser tab context in a real
Chrome session. `KeepSaveToggle.tsx`'s handler now calls
`queries.ts`'s `keepSave(db, saveId)` directly against the main thread's
own session connection; `protocol.ts` no longer has `keep`/`kept`/
`keep-failed` message types at all.

## OPFS persistence requires an explicit CHECKPOINT

DuckDB's own documentation says to `CHECKPOINT` after writes you can't
afford to lose, since a browser tab can terminate unpredictably. This
project ran into it as two separate real failures, not a theoretical
concern:

1. **Ingestion**: reloading the page and resuming a freshly-kept save
   reported `Catalog Error: Table with name save_meta does not exist!` —
   the parsing Worker's connection had written and closed correctly
   *within the same tab*, but that write wasn't durable across a full
   page reload (a new WASM heap, not just a new connection) without an
   explicit checkpoint first. Fixed by having `storage/db.ts`'s
   `closeSaveDatabase` always `CHECKPOINT` before closing — applies to
   every close, not just the ones a developer remembers to add it to.
2. **Keep**: even after the fix above, clicking "Keep This Save," then
   reloading and resuming, silently reverted to "not kept" — no error,
   just wrong state. Root cause: the main thread's session connection
   (where the keep-toggle's `UPDATE` runs) stays open for the rest of
   the session and is never explicitly closed until supersede/unmount,
   so the close-time checkpoint above never ran soon enough. Fixed by
   having `queries.ts`'s `markSaveKept` `CHECKPOINT` immediately after
   its own write, rather than relying on an eventual close.

Rule of thumb going forward: **any write whose caller doesn't immediately
close the connection needs its own explicit `CHECKPOINT`** — don't assume
`closeSaveDatabase`'s checkpoint will cover it.

(A Node-only wrinkle found while building the test harness: the
`@duckdb/duckdb-wasm/blocking` Node bindings' file-backed persistence did
not survive a genuine close + fresh-instance reopen in this version, even
with `CHECKPOINT`/`flushFiles()` — see `tests/helpers/duckdb-test-env.ts`
for the workaround. This is a test-environment-only issue; the browser
OPFS behavior above is separately confirmed correct via real Chrome
sessions.)

## Bulk inserts: Arrow, not a row-by-row prepared-statement loop

`storage/db.ts`'s `insertRows` originally ported wa-sqlite's row-by-row
prepared-statement loop verbatim (prepare once, `.query(...)` per row).
This worked fine against the tiny hand-crafted test fixture but was a
**real production crash** against an actual save: a user's real ~650MB
save threw `RuntimeError: memory access out of bounds` deep inside
DuckDB's `runPrepared`, reported live. Row-by-row was also independently
confirmed impractically slow regardless of the crash (~1.2ms/row in a
real Chrome session — minutes for a real save's `locations` table alone).

Fixed by bulk-loading via `conn.insertArrowTable` (an Apache Arrow table
built with `apache-arrow`'s `tableFromArrays`) whenever `sql` is a plain
`INSERT INTO table (cols...) VALUES (...)` where every row supplies every
listed column — 300,000 synthetic rows inserted in ~500ms in the same
real-browser test where row-by-row was still crawling and had already
been shown to crash at real-save scale. Statements that don't fit that
shape (the single-row `is_player` UPDATE; `save_meta`'s insert, which
mixes bound parameters with literal values) fall back to the original
row-by-row loop — fine, since both are always exactly one row.

Two real `insertArrowTable` constraints, neither obvious from its types,
both found by live testing rather than documentation:
- **`create` must be explicitly `false`** to insert into an existing
  table. Omitting it does not default to "insert" — it defaults to
  attempting `CREATE TABLE` and throws `ENTRY_ALREADY_EXISTS` against a
  table that already exists.
- **No partial-column inserts** — every column of the target table must
  be supplied, positionally (confirmed via a real "table X has N columns
  but M values were supplied" error). `raw_sections.id` (normally
  `schema.sql`'s `DEFAULT nextval(...)`) is generated in JS instead
  (sequential integers, starting at 0) rather than left to the database
  default — see the comment at that call site in
  `version-adapters/1.3.11.ts`.

**A second, separate bug surfaced while writing the regression tests for
this fix, entirely confined to the Node/Vitest test environment**:
`insertArrowTable` completed without error but inserted zero rows, in
every table, reproducible with trivially simple data — but *only* when
going through Vitest (both `jsdom` and plain `node` test environments
alike; not jsdom-specific). The same exact logic, run as a plain Node
script outside Vitest, worked correctly every time. Root cause: a dual-
module-instance hazard — this file's static `import { tableFromArrays }
from "apache-arrow"` resolves through Vite's SSR/Node transform pipeline
to a *different* module instance than the one `@duckdb/duckdb-wasm`'s
internal Node bindings natively `require()` at runtime, so the `Table`
object built by one `apache-arrow` copy isn't recognized by
`insertArrowTable`'s internal handling of the other copy — it silently
no-ops instead of throwing. Fixed with a second test-only seam
(`configureArrowForTesting`, alongside `configureDuckDBForTesting`):
`tests/helpers/duckdb-test-env.ts` uses Node's `createRequire` to
natively `require("apache-arrow")` — bypassing Vite's transform entirely
for this one import — and hands that exact instance to `db.ts`. This is
a test-environment-only issue; the browser AsyncDuckDB path is
unaffected (Vite's browser bundling naturally converges on one instance)
and was separately confirmed correct via real Chrome sessions both
before and after this fix.

## Data tables: Perspective, not plain HTML tables with app-level pagination

Every table-shaped tab (starting with Provinces, the first built) renders
through `@perspective-dev/*`'s `<perspective-viewer>` web component
rather than a plain HTML `<table>` with hand-rolled pagination —
explicit user decision (2026-09-18, "I would like it if we used
perspective from the very get go"), not deferred to whichever tab needed
real grid features first. `specs/002-db-technology-migration/research.md`'s
§5 has the full decision record; the real, non-obvious findings from
integrating it are below.

**Arrow end to end**: DuckDB's `conn.query()` already returns an Apache
Arrow `Table` (the same reasoning that motivated the DuckDB migration
above); `storage/db.ts`'s `queryArrowIPC` serializes that result to an
Arrow IPC buffer via `apache-arrow`'s `tableToIPC`, and
`worker.table(buffer)` (Perspective's own `Client`) consumes it directly
— no row-by-row JS conversion between DuckDB and the viewer. `queryRows`
(plain-object rows, with BigInt coercion) is kept as a separate function
for everything that isn't feeding a table tab.

**`@finos/perspective*` is deprecated** — the maintained packages are
`@perspective-dev/client`, `@perspective-dev/viewer`,
`@perspective-dev/viewer-datagrid`, `@perspective-dev/viewer-charts`, and
`@perspective-dev/react` (installed here, pinned to `5.5.1`). `npm view
@finos/perspective-viewer deprecated` confirms this directly; don't
follow older tutorials/examples that still reference the `@finos` scope.

**Vite needs `build.target: "esnext"`** — `@perspective-dev/*` ships ESM
with top-level await (its WASM bootstrap) un-transpiled; Vite's default
target predates TLA support and fails to bundle it
(`No matching export ... for import 'default'` against a `*.worker.ts`
source file) without this. This is a documented upstream issue
(finos/perspective#2795), not specific to this app.

**A real packaging bug, found via this project's own strict `tsc` build**:
`@perspective-dev/viewer-datagrid` and `@perspective-dev/viewer-charts`
5.5.1 (and 5.4.0 — checked directly) ship a declaration file
(`dist/esm/types.d.ts` / `event-detail.d.ts`) that re-exports a type via
`@perspective-dev/viewer/src/ts/extensions.js` — a path into that
package's *uncompiled TypeScript source* (`src/ts/`), not its compiled
`dist/esm/` output. Under this project's `noUnusedLocals`/strict
settings, that pulls a real `.ts` source file (with its own,
unrelated-to-us `noUnusedLocals` violation) into the program and fails
the build. `skipLibCheck` doesn't help — it only exempts `.d.ts` files,
and the file actually erroring is a `.ts` file transitively resolved
through those `.d.ts`s. Fixed via `patch-package`
(`patches/@perspective-dev+viewer-{charts,datagrid}+5.5.1.patch`,
redirecting both broken imports to `dist/esm/extensions.js`) rather than
loosening this project's own strictness — `postinstall: patch-package`
in `package.json` reapplies it on every install.

**Theming requires matching Perspective's own selector specificity, not
just loading after it**: `src/perspective/theme.css` reskins Perspective's
built-in "Pro Light" theme to the "Imperial Illuminator" design system
(palette-bearing CSS custom properties only — every structural/icon
variable Pro Light defines is left alone). A real, confirmed gotcha
found via live Chrome computed-style inspection: Perspective sets a
`theme="Pro Light"` attribute on `<perspective-viewer>` *and mirrors it
onto each plugin custom element* (`perspective-viewer-datagrid`, etc.),
and Pro Light's own CSS re-declares some variables (e.g.
`--psp-datagrid--pos-cell--color`) directly on those inner elements via a
`perspective-viewer [theme=Pro\ Light]` descendant-combinator rule. A
naive override on just the bare `perspective-viewer` selector loses
silently — not because of load order, but because a custom property set
directly on an element always wins over one merely inherited from an
ancestor. The fix has to match Pro Light's own selector shape
(`perspective-viewer, perspective-viewer[theme], perspective-viewer
[theme]`) to reach the inner plugin elements at all.

## Concurrent queries on one connection

wa-sqlite's async build ran on Asyncify, which unwinds/rewinds a single
WASM call stack per module instance — it did not support two in-flight
async SQLite calls against the same connection at once. This bit the
project twice under SQLite (an explicit `Promise.all` in `FileLoader.tsx`,
and later a React StrictMode double-invoke of a tab component's
data-fetching effect that froze the tab completely with no explicit
`Promise.all` anywhere in application code).

A real-browser spike during the DuckDB migration confirmed DuckDB-Wasm's
`eh` bundle tolerates concurrent plain `query()` calls fine. That spike
didn't specifically test concurrent *prepared statements* on one
connection (this app's `insertRows`/parameterized `queryRows` both
prepare-then-close per call), so `src/storage/db.ts` keeps the same
per-connection queue (`withConnectionQueue`, a
`WeakMap<SaveDatabase, Promise<unknown>>`) serializing every
`db.conn`-touching call as cheap insurance — costs nothing when nothing
overlaps, removes a whole category of doubt when something does (e.g. a
StrictMode double-mount). See `tests/storage/connection-queue.test.ts` for
the regression test and `.specify/memory/architecture_constitution.md`'s
Async and Integration Rules for the project-wide rule this enforces.

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
researched yet (constitution Principle II) — see "Full save-schema
mapping tooling" below for the tool that turns "nobody has researched
yet" into a repeatable, automated process instead of one section at a
time by hand. Known cost: more parse
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
`get*ByIdx` pattern, backed by the one long-lived session connection
described above, is meant to generalize to future selectable views (e.g.
provinces), not stay a one-off nation dropdown.

## Persistence model

A save is session-only by default: the parsing Worker writes into a new
OPFS-backed database on every load, and it's deleted — via
`cleanupSaveIfNotKept` — either when a new load supersedes it or on tab
close (`beforeunload`, best-effort only; see that function's own doc
comment for why it can't be guaranteed). If the user chooses to "keep" a
save, that deletion is skipped and the database persists in OPFS across
browser sessions instead.

"Keep" runs entirely on the main thread now (see above): `markSaveKept`
sets `save_meta.kept = 1` and immediately `CHECKPOINT`s (see "OPFS
persistence requires an explicit CHECKPOINT"), then `recordKeptSave`
writes a small `localStorage` pointer (`nauticalbeg.keptSave`) recording
which save that is — there's no other cheap way to answer "which save is
kept" across separate per-save database files without scanning OPFS. Both
steps are kept as separate functions (not because of any thread
restriction anymore, just to preserve FR-014's ordering guarantee) — only
one save may be kept at a time in v1 (Assumptions), and keeping a new one
deletes the previous kept database only *after* the new save's own write
succeeds, so a failure (most notably hitting a storage quota, FR-014)
never destroys a still-valid previous kept save.

On startup, `FileLoader.tsx` checks `listKeptSave()` and, if one exists,
offers to resume it (`KeptSaveOffer.tsx`) instead of requiring a fresh
upload. Resuming (`resumeSave` in `parser/load-save.ts`) reopens the
already-parsed database directly by id and skips file-reading/version-
detection/parsing entirely — it reuses the exact same `ready`/`error`
worker-protocol messages a fresh load produces, so the UI code that
handles "a save became ready" needed no special-casing for "was this
parsed just now, or resumed from a previous session." Like `loadSave`,
it closes (and checkpoints, though nothing new was written) its
connection before signaling ready, for the one-handle-per-file reason
above.

See `specs/001-save-import-overview/data-model.md`'s state-transition
diagram for the full picture.

## Full save-schema mapping tooling

`tools/schema-mapping/` (`specs/004-full-schema-mapping`) is a
maintainer-run, offline CLI — mirroring `tools/map-generation/`'s
pattern exactly — that walks **every** top-level section of a real save
(not only the handful the app currently interprets) and records every
field path's observed type(s), presence, and an example value into a
JSON "Save Inventory," with a generated Markdown summary for review.
Run via `npm run schema-map -- inventory --save <path>` /
`... diff --baseline <inv.json> --candidate <inv.json>`. It exists
because Paradox patches the save format on its own schedule, and
research-save-format.md-style manual research (read megabytes of raw
save text by hand, once per section, only when a UI feature needs it)
doesn't scale to "map everything" — this tool makes that process
repeatable and automated instead.

**Full scan, not sampling — deliberately.** Both optionality detection
(does every entry have this field?) and fixed-vs-variable-keyed
classification (research.md §3 below) require seeing every entry of a
collection, not a sample: a field that's rare enough to be missed by
sampling is exactly the kind of thing this tool exists to catch. This
is safe here in a way it wouldn't be in the app's own browser-side
parse — it's an offline Node process, not something blocking a UI
thread (constitution Principle V's "MUST NOT block the main UI thread"
targets the runtime app, not this tool).

**Fixed-shape vs. variable-keyed classification.** A nested object's
key-set is classified across every sampled instance, not one: if the
same bounded vocabulary of keys keeps recurring (allowing a minority of
per-instance optional keys), it's `fixed_object`, and every key seen
becomes a candidate real column. If the key-set keeps growing with more
instances sampled (each instance drawing from a much larger shared
catalog — e.g. a province's produced trade goods, keyed by good name),
it's `variable_object`, captured as one lossless JSON column instead of
one speculative column per possible key. The threshold
(`NUMERIC_KEY_RATIO_THRESHOLD`/the fixed-vs-variable ratio in
`classify.ts`) was calibrated against real fixture and real-save data,
not chosen a priori.

**Real bugs this tool's own real-save run found** (none caught by the
small committed fixture — see `specs/004-full-schema-mapping/research.md`
§6 for full detail): (1) `array.push(...hugeArray)` blows V8's
call-stack argument limit for a real 28,573-entry collection — this
looked like a stack-overflow-from-recursion-depth crash but wasn't;
fixed by looping instead of spreading (a genuine max-depth guard for
real deep nesting was added alongside this, for a separate reason).
(2) Real save keys aren't always plain integers — some are
decimal-formatted strings ("0.03388") in the same map as integer keys.
(3) A numeric-keyed collection can sit directly at a section's own top
level (`diplomacy_manager`), not only under a named sub-key like
`countries.database`. (4) A numeric-keyed collection can have a
minority of named keys mixed in alongside its indexed entries
(`diplomacy_manager`'s 12 named action-type keys alongside its 2,470
per-country entries) — needing a ratio-based, not all-or-nothing,
collection-detection rule. (5) A full "1-1" inventory of the real
~642MB save produces a 285MB JSON file — far too large to commit, so
`tools/schema-mapping/inventories/` is gitignored in full; the tool's
code and its fixture-based regression test are what's committed and
reviewable, not a specific real-save run's output.

**Applying a finding to real schema** (User Story 2's pattern, first
used for the `population` table): a section's fixed-shape scalar fields
become real, individually-typed `schema.sql` columns; anything
classified `variable_object` (or otherwise too unpredictable — FR-011)
becomes a single JSON-text column instead, following the exact same
fixture-first testing discipline (constitution Principle II) as every
other adapter change in this project — a real, committed fixture
excerpt and a failing regression test come before the schema/adapter
change, not after. One real finding from applying this pattern:
`population`'s entity indices exceed 32-bit `INTEGER` range in the real
save (unlike `nations`/`provinces`/`locations`, which comfortably fit
it) — confirmed via a real insert failure against the real save, not
assumed; `population.idx` uses `BIGINT`.

`wars` (`war_manager.database`) was a second, independent application of
the same pattern (2026-09-19) — see `specs/004-full-schema-mapping`'s
research.md §8 for the full real findings, including the same
`BIGINT`-entity-index issue re-confirmed independently, and a real
finding specific to this section: most of `war_manager.database`'s raw
entries (47 of 56, in the designated real save) are inert `"none"`
placeholder slots, not wars at all.

## Encyclopedia: IA restructuring and the Wars tab (2026-09-19)

The top-level "Country Viewer" section was renamed **Encyclopedia** and
given its own horizontal sub-nav (`EncyclopediaNav`) with five peer
tabs: Countries (the previously-built nation selector + side-nav shell,
unchanged), Wars, Leaderboard, Characters, and Markets (the latter three
`ComingSoonPlaceholder`s for now). This is a UI/IA decision, not a new
spec-kit feature — no `specs/NNN-.../` directory exists for it; it's
recorded here instead, per this file's own "living summary" convention.

Wars is a peer of Countries, not nested under it, because a war belongs
to no single nation — `Shell.css` gained a third grid state
(`shell--with-subnav`: top bar + sub-nav + full-width main, no side nav)
for exactly this case, alongside the existing bare and `with-nav`
(Countries, once a save is loaded) states.

The Wars tab itself binds `wars` (see above) via `queries.ts`'s
`listWarsArrow`, joined against `nations` for attacker/defender display
tags, rendered through the same Perspective-viewer pattern
`ProvincesTab` established (`WarsTab.tsx`/`.css`). Column selection
(attacker, defender, ongoing/dates/duration, scores, casualties, war
type) was direct product input, not a design-system default — a player
asking "what do I want to know about a war" would ask exactly those
questions. Selecting a row to open a single-war detail page is a known,
explicitly deferred future piece, not an oversight.

### Three real bugs found running this against the actual kept save

None of these were caught by the unit/integration test suite, because
each depends on real browser-only state (a live OPFS connection, or an
already-existing kept save's on-disk schema) that the test harness
deliberately no-ops or never accumulates. Found by actually running the
app against a real, previously-kept ~642MB save — not by inspection.

1. **A kept save predating a new table crashes on resume.**
   `schema.sql` is only ever applied once, at first parse
   (`loadSave` in `parser/load-save.ts`) — resuming a kept save
   (`resumeSave`) just opened a connection and read from it directly.
   Adding the `wars` table (or any future table) to `schema.sql` did
   nothing for a save kept *before* that change: resuming it hit a hard
   `Catalog Error: Table with name wars does not exist!` the first time
   anything queried it. Fixed by having `resumeSave` re-run
   `applySchema` too — every statement in `schema.sql` is `CREATE TABLE
   IF NOT EXISTS`, so this is a no-op for existing tables and just
   backfills missing ones (empty, since this save was never re-parsed
   with the adapter that would populate them — the affected tab's
   existing empty-state handling already covers that gracefully).

2. **Deleting the active save's own OPFS file while its connection is
   still open throws.** "Forget This Save," clicked while that exact
   save is the currently loaded one, called `deleteSaveDatabase`
   without first closing `readDbRef`'s live connection to that same
   file. DuckDB-Wasm holds an OPFS file open exclusively for as long as
   a connection lives, so the delete failed with a real
   `InvalidModificationError: An attempt was made to modify an object
   where modifications are not allowed`. Fixed in `FileLoader.tsx`:
   forgetting the active save now closes that connection first, then
   deletes, then returns the app to the idle "select a save" state
   (there's nothing left to browse once the data is actually gone).
   Untestable in the unit-test harness by design — `deleteSaveDatabase`
   no-ops there with no real OPFS to delete from.

3. **The native `<input type="file">` always read "No file chosen."**
   Its own `onChange` handler resets `event.target.value = ""`
   immediately after a selection (needed so the same file can be
   re-selected later), which also blanks the input's native label —
   so it looked broken (no file loaded) even with a save actively
   ready. Fixed by replacing the native label with an app-controlled
   status line (`TopBar.tsx`) reflecting `save_meta.filename` from the
   actual loaded save, with the picker's own heading switching to "Load
   a different save" once something's loaded. Separately, the
   Keep/Forget button's own width changed between "Keep This Save" and
   "Forget This Save" (and an appearing/disappearing "[ kept ]" tag),
   reflowing the top bar on every toggle — fixed by giving the button a
   fixed `min-width` and always mounting the tag (visibility-toggled,
   not conditionally rendered) so its width is reserved either way.

## Perspective tables: bigger by default, and a universal load indicator (2026-09-19)

Two further UI passes, also outside any numbered spec-kit feature:

- Every `<perspective-viewer>` in the app (not per-tab — set once in
  `perspective/theme.css`, inherited across the shadow-DOM boundary the
  same way the existing color-token overrides already were) now renders
  with a taller row height and larger base font-size, and the
  Wars/Provinces containers no longer sit inside the shell's centered
  `max-width: 64rem` cap (`Shell.css`'s `shell__main-inner--full-width`
  modifier) — only actual data-table tabs opt into that; Overview cards
  and placeholders keep the original centered width.
- A single loading state, previously shown only on the Countries tab,
  now shows on every tab: `LoadingCircle.tsx`, a large centered
  circular progress indicator with a percentage in the middle, replaces
  per-tab content for every `Status` kind that means "a save is
  actively loading" (resuming, validating, detecting version, parsing,
  loading overview), regardless of which app section/tab is selected.
  The percentage is derived only from real known milestones (byte-read
  progress within "validating," plus which ordered stage has actually
  been reached) — never a fabricated estimate of progress within a
  stage that reports none of its own (constitution Principle IV); a
  stage with no granular signal of its own gets a gentle pulse instead,
  so a percentage held steady for a while (e.g. parsing a large save)
  still reads as active rather than stuck.

## Map Visualization (005) ships; the location join needed two attempts (2026-09-20)

`specs/005-map-visualization` landed the Map tab: four layers (Political,
Location Population, RGO, Control) rendered on a `<canvas>` over
feature 003's generated geometry, with a collapsible sidebar and legend.
The interesting part wasn't the layers — it was getting a location's
save data to actually join against its map shape, which took two wrong
turns before the real mechanism turned up. Full blow-by-blow in
`specs/005-map-visualization/research.md` §1; summary here since it's
exactly the kind of only-discoverable-against-a-real-save finding this
log exists for:

1. The save's per-location `name` field (`locations.locations[idx]
   .name`) — the obvious-looking join key at spec time — is a rename-
   override, present on ~0.02% of a real save's 28,573 locations. Not
   usable at all.
2. The first real fix baked a numeric `idx` into the map geometry,
   computed from `location_templates.txt`'s file order in the game
   install (briefly reopening 003 to do it). Looked right in aggregate
   (~83% cross-check match) but was **wrong for real, visible reasons**
   once actually run against the app: sea tiles rendered with owner
   colors, and specific countries appeared to own land that wasn't
   theirs (Venice "owning" a gulf near the Baltic, etc. — turned out to
   be `krosno_odrzanskie`, a real Polish town, misassigned by drift
   between the save's original game version and the currently-installed
   one's `location_templates.txt`). Fully reverted — 003 is back to its
   original shape, no geometry-side idx.
3. The actual fix: every save embeds its own authoritative location
   ordering at `metadata.compatibility.locations` (there for multiplayer
   data-sync checking), immune to the version-drift problem that broke
   attempt 2 since it travels with the save itself, not the currently-
   installed game. `locations.name` is populated from
   `compatibilityLocations[idx - 1]` at parse time; the join is name-
   based again, like provinces already worked. Validated at 99.92%+
   accuracy and 100% end-to-end resolution against a real 642MB save.

Two lessons worth keeping: an aggregate cross-check metric (raw_material
match rate) can look convincing while still hiding a real, localized
bug — the thing that actually caught attempt 2 was eyeballing the
running app, not a better percentage. And this project's "derive static
data from the local game install, commit the result" pattern (003's
whole approach) is only sound when the *save* being analyzed can't have
been created on a different install-file version than whatever produced
the committed asset — true for provinces (parser reads `province_
definition` directly off the save), false for a geometry-side idx
computed from a install file whose declaration order isn't guaranteed
stable across game patches.

A live UI refinement pass followed once the fix was confirmed working in
a real browser (dev server + the user's own OPFS-kept save, no file
upload needed): a horizontal map-wraparound render was built, confirmed
mechanically correct, and then removed again after it measurably hurt
pan/zoom performance at this feature's scale; a real CSS bug let the
legend grow past the map's own bottom edge once a layer had enough
entries (a wrapper `div` had `max-height` with no explicit `height`,
which a child's own percentage `max-height` can't resolve against) —
fixed by flattening the wrapper and giving the legend's list a genuine
flex-bounded height for its CSS `columns` layout to size against; the
RGO layer's colors were switched from a generated palette to the game's
own real colors (traced through `common/goods/*.txt` + `common/
named_colors/02_map.txt` into a committed static table, `rgoGameColors
.ts`); and the hover tooltip now follows the cursor instead of sitting
fixed in a corner.

## Country Leaderboard (006) ships: three hand-rolled visualizations, and Perspective ruled out twice on hard evidence (2026-09-20)

`specs/006-country-leaderboard` landed a new "Leaderboard" section
under Factbook (see below): three pages (Population, Economic Base, Tax
Base — the only per-year time series the save actually tracks;
`historical_population`/`historical_tax_base`/`historical_economical_base`
on each country record, landing in a new `nation_history` table), each
switchable between a line graph, a ranking table, and a treemap, all
sharing one search-overlay-driven country selection. Default selection
is every country the save marks as human-played (`played_country`,
extended to capture every human player rather than just the first,
which is all the pre-existing `is_player` column tracked).

**Perspective was investigated twice for this feature's visualizations
and rejected both times on direct evidence, not assumption** — worth
recording since it's this app's standard charting tool everywhere else:

1. For the line/wealth charts: every color mode Perspective's chart
   plugins expose (`"series"` categorical, palette-assigned by split
   group; `"numeric"`, a continuous gradient) resolves to an
   auto-assigned or interpolated color — there is no mechanism to bind
   an arbitrary literal RGB value from a data column to a series, the
   same gap 005 hit for the map (research.md §7 there).
2. For the treemap: re-investigated specifically because it looked more
   promising from the source (`tree-data.ts`'s `palette[dictIdx %
   paletteSize]`, seeded from a real, documented `ViewerConfig
   .columns_config`/`sort` config surface — not the undocumented hack
   it first looked like). Built an actual throwaway spike
   (`src/PerspectivePalettePoc.tsx`, gated behind a temporary `?poc`
   flag, fully reverted after) and drove it through a real running
   browser: the Style editor's actual UI persists a `gradient` key with
   percentage stops, not the `palette` key its own
   `column_config_schema()` declares for a string/Hierarchical-category
   column — confirmed inconsistency in the library, not a
   misconfiguration here. Even after getting a `gradient` value to
   round-trip through `columns_config` (confirmed via `viewer.save()`),
   rendered colors never changed; forcing a repaint via
   `restyleElement()`/`restore()` threw a WASM `"View not found"` error.

Both charts and the treemap were hand-rolled SVG at ship time (`LeaderboardChart
.tsx`, `LeaderboardTreemap.tsx` + `treemapLayout.ts`'s squarified-treemap
implementation) — consistent with 005's map choice, confirmed twice
over for the same underlying reason. **Superseded by feature 007** (see
below): both were retrofitted onto Apache ECharts, which turned out to
support the exact literal-RGB-per-node capability Perspective's plugins
lacked — `treemapLayout.ts` is deleted.

**A real, user-reported bug in the treemap's "Other" bucket**: `country_type
= 'Real'` (the existing "is this a real nation, not Pirates/DUMMY"
filter, reused from feature 001) covers ~2,467 of ~2,470 country slots
in a real save — the overwhelming majority long-defunct historical tags
that formed and were annexed centuries ago, not currently-alive nations.
The treemap's "Other" box (every non-selected real country's latest
value, summed) was silently including all of them, each contributing a
centuries-stale figure from whenever it was last alive. Fixed by also
requiring current territory ownership (`EXISTS` against `locations
.owner_idx`) — the same signal 005's map already treats as
authoritative for "is this country alive." Verified against a real
save: contributing countries dropped from 2,467 to 265, Other's share
of world population dropped from ~99%+ to 60.6%.

**Nav rename, decided alongside this feature**: "Map" → **Atlas**
(label only); "Encyclopedia" (Countries/Wars/Leaderboard/Characters/
Markets) → **Factbook** (internal `AppSection` id renamed too, since a
genuinely new, separate **Encyclopedia** top-level section was added at
the same time — currently a placeholder). `EncyclopediaTab`/
`EncyclopediaNav.tsx` were deliberately left named as-is — they
describe Factbook's own five sub-tabs, a still-accurate name for a
still-accurate concept independent of the section-level rename.

## Game Encyclopedia (008) ships: a second data source entirely outside the save pipeline, and a constitution amendment to allow it (2026-09-20)

`specs/008-game-encyclopedia` filled in the top-level **Encyclopedia**
placeholder from feature 006 with a browsable, searchable reference of
the game's own definitions — goods, buildings, religions, traits, units,
and the rest of its ~124 `game/in_game/common/` categories plus the
`game_concepts` glossary — scraped from a local EU5 installation (base
game **and** owned DLC) rather than from any save file. This is a
deliberately different data source from everything else in this app:
`tools/encyclopedia-scraping/` (mirrors `tools/map-generation`'s
`--install` CLI convention) parses the game's own `.txt`/`.yml` files
with the existing `jomini` dependency — the same Clausewitz grammar it
already parses for saves — and writes static JSON to
`public/encyclopedia/` (mirrors `public/map/*.topojson`'s "generate
once, fetch on demand" pattern), never touching `src/storage/`'s
per-save DuckDB schema. The Encyclopedia section renders with or without
a loaded save.

**Constitution amended (v1.1.2 → v1.2.0) before this feature could be
built at all**: the existing Technical Constraints flatly banned
redistributing Paradox's game text/assets as part of the app. A narrow
**Encyclopedia-data exception** now permits shipping *structured*
game-mechanics data (keys, localized names/descriptions, numeric
values) — factual/informational content, not creative art — while the
ban on icons/textures/other art stays exactly as strict as before: this
feature ships zero image files (verified: `git ls-files` for
`.dds`/`.png`/`.jpg`/etc. under `public/encyclopedia/` and
`tools/encyclopedia-scraping/` returns nothing). The exception covers
DLC content on the same terms as the base game.

**The game already has its own "Europedia"** (confirmed:
`main_menu/localization/english/encyclopedia_l_english.yml`'s
`HEADING_ENCYCLOPEDIA: "Europedia"`) — its own 40-page curated list and
a 2,633-line hand-written `game_concepts` glossary are used as a
labeling/priority signal (`categories.ts`'s `CategoryMeta.label` prefers
the game's own page wording), not as a hard inclusion filter — several
categories the game's own Europedia widget has no dedicated page for
(`goods_demand`, `production_methods`, `prices`) are still included,
since they're exactly what a planned Production/Trade/Markets feature
will need.

**Two real bugs found and fixed by actually running generation against
the real local install, not just reading the code:**

1. `game_concepts` entries localize under a `game_concept_<key>` prefix
   (e.g. the definition key `modifier` has no `modifier` loc string at
   all, only `game_concept_modifier: "Modifier"`) — before this was
   known, only 90 of 696 real entries resolved a name. Fixed with a
   category-specific lookup in `write-output.ts`; verified 696/696 after.
2. `generate.ts`'s own category loop only ever iterates the committed
   `categories.ts` table, so it could never by itself notice a new
   category folder a future game patch adds — `warnOnUnlistedCategories`
   closes that gap with an explicit disk-listing scan, run once per
   generation (verified: zero unlisted categories against the real
   install today).

Cross-references between entries (e.g. a building's `category` field →
a Building Categories entry) are resolved once at generation time
against *every* parsed category, including excluded ones — a reference
to an excluded category's key renders as a real (if unresolved) link
note rather than silently vanishing, while a reference to a genuinely
absent DLC key produces no link at all (there's no way to tell "meant
to reference something now missing" from "never was a reference").
24,658 real cross-references were found this way on the first real
generation run, across 8,935 entries with at least one (every parsed
`building_types` entry had at least one).

## Production, Trade & Markets (007) ships: a new save section, and a mid-plan pivot to Apache ECharts for all charting (2026-09-20)

`specs/007-production-trade-markets` filled in the reserved-but-placeholder
Factbook → Markets page: a world goods-production overview, a
sortable/searchable market list, a per-market per-good breakdown
(price/supply/demand/stockpile/import-export, with supply and demand
decomposed into their component sources), and a price-history chart per
market/good pair. The save's `market_manager` section (the single
largest section in the save by field-path count, per 004's earlier
shallow characterization) was previously uningested, caught only by the
`raw_sections` opaque-JSON fallback; this feature adds it to
`1.3.11.ts`'s `STRUCTURED_KEYS`, extracting into four new tables
(`markets`, `market_goods`, `market_good_price_history`,
`world_good_production`) following the exact `nations`/`nation_history`/
`population` conventions already established.

**Two real save-format quirks found only by inspecting a full inventory
scan, not the schema-mapping tool's earlier shallow pass:**

1. A market has no display-name field in the save at all — every
   observed field is numeric/list/nested. Names are derived at query
   time via the same `COALESCE(provinces.name, 'Location ' || idx)`
   fallback chain `listProvincesArrow` already established, with one
   further `'Market ' || idx` layer for the edge case where a market's
   own `center` field is absent.
2. `goods.<good>.history` (the per-good price series) is a bare list of
   numbers with **no embedded dates** — cadence looks monthly against
   the save clock but isn't confirmed. Dates are computed once, at
   parse time, counting back from the save's own current date
   (`metadata.date`), and stored as an explicit `date` column, rather
   than leaving every consumer to re-derive the anchor/cadence
   convention independently. Flagged for re-verification once a second
   real save is available to confirm the monthly-cadence assumption.

Two of the save's per-market list fields (`members` vs. `market`) look
equally plausible for "which locations belong to this market" from field
names alone; `members` was chosen as the closer match, also flagged for
re-verification against a real save — the schema stores only the
resulting count, not the list itself, since no requirement reads the
individual member locations.

**Mid-plan scope addition, decided with the user partway through
planning: consolidate this app's charting/visualizations on Apache
ECharts**, using this feature's new price-history chart as the vehicle,
and retrofitting the two hand-rolled SVG visualizations from 006
(`LeaderboardChart.tsx`, `LeaderboardTreemap.tsx`) in the same pass —
`@perspective-dev/*` remains the datagrid/table library, unchanged.
Notably, **ECharts' treemap series supports an explicit per-node
`itemStyle.color`**, the exact capability 006's decision log above
records Perspective's Treemap plugin lacking after two direct
investigations — confirmed before committing to the retrofit, not
assumed. All three chart components (the new `MarketGoodPriceChart` plus
the two retrofits) share one new lifecycle hook,
`src/components/Overview/charts/useEChartsInstance.ts` (`echarts.init`/
`setOption`/`ResizeObserver`-driven `.resize()`/`.dispose()`), using
ECharts' **SVG renderer** rather than its canvas default — deliberately,
since jsdom (this project's test environment) has no real `<canvas>` 2D
context, and SVG output stays fully inspectable in tests. One real
consequence of testing under jsdom worth recording: **ECharts' actual
layout is meaningless under jsdom's zero-size container** (confirmed —
a 2-node treemap only ever draws its larger box at a 0×0 container size).
Every ECharts-based component's tests therefore mock
`useEChartsInstance` itself and assert on the exact `option` object
built, rather than on rendered pixel/DOM output — the same pattern
`LeaderboardTab.test.tsx`'s own two chart-dependent assertions were
rewritten to use, once real rendering proved unreliable there too.
`treemapLayout.ts` (006's hand-rolled squarify layout) is deleted as
dead code once the treemap retrofit landed — nothing else called it.

**Row-selection-to-callback was new plumbing for this codebase's
`PerspectiveViewer` usage** (006's `WarsTab.tsx` explicitly deferred it).
Resolved during implementation, source-confirmed rather than guessed:
`@perspective-dev/react`'s `PerspectiveViewer` has a documented `onClick`
prop subscribing to the underlying element's own `"perspective-click"`
event, whose `detail.row` is the clicked row's full `View.to_json()`
result keyed by whatever the viewer's own `config.columns` lists —
nothing else. Because the click callback needs a market's numeric `idx`
(not its display `name`, not guaranteed unique), `idx` is a real,
visible grid column in `MarketList`, not merely queried-and-hidden —
Perspective has no such concept.
