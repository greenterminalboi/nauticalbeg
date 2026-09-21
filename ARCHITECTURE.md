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

## World Goods Production Share (009) ships: a second, previously-unread save field, and `LeaderboardTreemap` becomes `ShareTreemap` (2026-09-21)

`specs/009-world-goods-production` promoted World Goods from a block
always stacked inside `MarketsTab` to its own switchable page (mirroring
`LeaderboardTab.tsx`'s `activeView`/`VIEWS` button-group pattern rather
than a new top-level Factbook nav entry), and added a production-share
treemap: selecting a good with coverage shows one box per producing
country, sized by its share of that good's summed production.

**Found, not assumed, that per-province production-by-good data already
exists in the save**: `provinces.database.*.last_month_produced.<good>`
— a real, populated field (3295 of 4071 provinces in the reference
save) this app's `1.3.11.ts` adapter had read past but never stored,
since the `provinces` extraction loop only ever pulled
`province_definition`/`owner`/`capital`. Its 52-good vocabulary is a
strict subset of `market_manager.produced_goods`'s 71 (007) — the 19
goods present only in `produced_goods` (cannons, cloth, firearms,
tools, furniture, paper, weaponry, masonry, tar, leather, glass,
jewelry, pottery, liquor, beer, books, naval_supplies, slaves_goods,
fine_cloth) are manufactured/building outputs with no per-province
figure here; attributing them per-country would need `building_manager`
(138,516 rows, already excluded from 007 on size grounds). This
feature's own scope is deliberately exactly the 52 — the UI makes the
gap visible (a real, derived `has_production_coverage` column, never a
hardcoded list) rather than silently pretending the other 19 don't
exist; extending to them is explicitly a planned future feature, not
abandoned.

**`LeaderboardTreemap` renamed to `ShareTreemap`**: the component had
no Leaderboard-specific logic to begin with (`title` + generic
`entries`), and once this feature needed the exact same "named, colored,
valued entries" treemap for a second, unrelated purpose, keeping the
old name would have actively misled a future reader. Mechanical rename
— component, CSS, test file, `LeaderboardTab.tsx`'s one import — no
behavior change.

**Implementation-time simplification over the original design**: the
plan called for `WorldGoodsPage` to hold its own decoded `WorldGood[]`
list just to look up a selected good's coverage flag. Since
`WorldGoodsOverview`'s grid already carries `has_production_coverage`
as a real column, the click payload carries it too — `onSelectGood(good,
hasProductionCoverage)` — so `WorldGoodsPage` needs neither the extra
fetch nor the lookup, and a real async race (selecting a good before
that separate list finished loading) never exists in the first place.

**Unattributed production is a distinct bucket from "many small real
countries"**: a good's production not attributable to any
`country_type = 'Real'` owner (an unowned province, or one held by
Pirates/a rebel faction) is never dropped and never folded into a real
country's share — it's its own labeled treemap entry, computed
client-side by reusing `loadLeaderboardCountries`'s existing Real-only
filter and mirroring `LeaderboardTab.tsx`'s own "selected countries +
Other" bucket pattern exactly. Separately, real countries beyond the
top 15 producers (by amount) fold into a second, distinct "Other
producers" bucket, so a common good's treemap (dozens of real
producers) stays legible without conflating "no real owner" with "many
small real owners."

**Post-ship follow-up, same day**: the World Goods/Markets switch moved
from a top-of-content button group inside `MarketsTab.tsx` into the
shell's side nav (`MarketsSideNav.tsx`, wired into `FileLoader.tsx`
exactly like `LeaderboardSideNav`) — a primary page switch belongs in
the side nav by this project's convention, not a `MarketsTab`-local
toggle (that idiom is reserved for a secondary axis, like
`LeaderboardTab.tsx`'s own graph/ranking/treemap toggle underneath its
side-nav-selected metric).

**Post-ship bug fix, same day: the loading screen's "Parsing save…"
step reported progress exactly once, then went silent until the whole
adapter call returned.** `computeLoadingPercent` pinned that stage at a
static 50% (with a gentle pulse) for its entire duration regardless of
how long it actually took — harmless while it was short, but 007/009
between them added real, substantial extraction work to that same
phase (market price history — up to ~184 markets × ~80 goods ×
100+ monthly points each, potentially over a million rows — plus
province-level good production, thousands of provinces × up to 52
goods) with zero added feedback. A real user report ("parsing takes
forever") traced to exactly this: not a hang, but a now-materially-longer
phase with no progress signal at all, indistinguishable from one from
the loading screen. Fixed by threading a real milestone-based progress
callback through `1.3.11.ts`'s own extraction passes
(`PARSE_MILESTONES`, 11 steps — each a genuine "reached this point"
signal, equal-weighted like the outer `LOADING_STAGE_ORDER` already is,
never a fabricated time estimate per constitution Principle IV) up
through `load-save.ts` to the existing `onProgress("parsing", percent)`
channel `FileLoader.tsx` already consumed for "validating"'s byte-read
progress — the same mechanism, just previously unused for "parsing."

**Post-ship wrap-up, 2026-09-21: 007/009's remaining rough edges,
resolved as one batch.**

- **`market_good_price_history` removed entirely** (table, extraction,
  the per-market/good price chart it fed). A real user report — pulling
  a monthly price time series for every good in every market was the
  single largest cost in parsing a real save, for a feature that wasn't
  worth that cost. `MarketGoodsTable` is now a plain read-only grid (no
  row-selection-to-chart wiring); the schema keeps only a comment where
  the table was, since additive-only schema means an old kept-save may
  still have inert leftover rows nothing reads or writes anymore.
- **"Country exists" filtering extended app-wide.** `listNations` and
  `listLeaderboardCountriesArrow` already excluded non-`Real`
  `country_type`s; both now also require
  `EXISTS (SELECT 1 FROM locations WHERE locations.owner_idx = nations.idx)`
  — a `Real`-typed tag that currently owns no territory (a defunct
  historical tag left in the save) is excluded the same way Leaderboard's
  treemap "Other" bucket already excluded it. `listWarsArrow` is a
  deliberate exception (historical war participants by design); a
  market's own owner join (`listMarketsArrow`) is deliberately NOT
  filtered this way either — "who currently owns this market's center
  location" should show the real answer even if that owner is otherwise
  filtered from leaderboards.
- **Market naming switched from province to location.** `listMarketsArrow`
  no longer joins `provinces` at all; a market's display name now comes
  from `locations.name` (populated from
  `metadata.compatibility.locations`, a single always-present ~28,573-
  entry array with real names) via its `center_location_idx`, falling
  back to `'Location ' || idx`, then `'Market ' || idx` if the center
  itself can't be resolved — never a fabricated name.
- **Market owner added.** `listMarketsArrow` now also joins the center
  location's current owner nation, surfacing `owner_idx`/`owner_name`/
  `owner_color_*` (unfiltered by the existence check above, on purpose)
  through `decodeMarkets` and into `MarketList`'s grid.
- **Leaderboard's line chart x-axis now uses `scale: true`** (mirroring
  the y-axis, which already had it) — EU5's earliest year is 1337, not
  0, and ECharts' "value" axis defaults its min to 0 without this,
  wasting most of the plot on thirteen unplotted centuries.
- **Every chart canvas enlarged app-wide**: `LeaderboardChart` and the
  shared `ShareTreemap` (used by both Leaderboard's treemap and World
  Goods) now size to `min(70vh, 44rem)` instead of a fixed `20rem` —
  the shell doesn't constrain these tabs' content to viewport height the
  way Map's flush layout does, so a viewport-relative height is how a
  canvas actually fills its panel instead of floating in leftover page
  space.
- **World Goods page redesigned.** `WorldGoodsOverview` (the always-
  visible data grid) is gone; picking a good is now `GoodSelect`, a
  single-select searchable combobox scoped to only the goods with a
  production-share breakdown (RGOs) and defaulting to wheat. Since a
  good without coverage is no longer offered at all, the old "not
  available" per-selection message and the extra
  `hasProductionCoverage`-through-the-click-payload plumbing are gone
  too — the boundary between covered and uncovered goods is now made
  by what's in the list, not by rejecting a selection after the fact.
  The selected good's world total (already loaded alongside the
  covered/uncovered list) renders next to the picker. `ShareTreemap`
  itself gained `squareRatio: 1` (a boxier layout, closer to square
  boxes than thin slivers) and a per-box drop shadow/border via
  `itemStyle`, on explicit request to make it look better — applied to
  the shared component, so Leaderboard's treemap gets the same
  treatment.

**Post-ship follow-up, 2026-09-21 (same day, three more rounds).**

- **`ShareTreemap` fills its container, no title, no grey box.** First
  round: dropped the `title` prop and the container's padding entirely
  (canvas fills `.share-treemap` edge to edge) — the good/metric being
  shown was already visible from whatever selected it (`GoodSelect`,
  the Leaderboard side nav), so the repeated label was redundant. Third
  round, from an annotated screenshot in `specs/debug_images/` marking
  up the grey background/border box the treemap sat inside: removed
  that background/border/border-radius entirely from both
  `.share-treemap` and `.leaderboard-chart` — they now sit directly on
  the page's own background, with spacing from the controls above
  coming from the parent's own flex `gap`, not a box of their own.
- **World Goods renamed to "Global RGO Production"** in the side nav
  (`MarketsSideNav.tsx`'s label only — the `"worldGoods"` view id is
  unchanged).
- **World Goods' treemap selection is now on-demand, mirroring
  Leaderboard's own treemap.** `WorldGoodsPage` replaced the old
  automatic "top 15 producers, rest folds into Other" cutoff with an
  explicit `selectedIdxs` selection (still defaulting to the top 15 by
  amount whenever the good changes), and a new `AddCountryInput`
  component lets the user add or remove any other real country on
  demand — same filter-by-name-or-tag matching Leaderboard's
  `CountrySearchOverlay`, but as a plain always-visible search input
  (placeholder "Add country…") that opens its results on focus, rather
  than a separate toggle-button-plus-panel. `buildEntries` re-keyed off
  selection instead of rank, keeping the same "Other producers" vs
  "Unattributed" distinct-bucket rule (FR-008/FR-009).

## Ruler History (specs/006-country-leaderboard stretch goal, 2026-09-21)

A new Leaderboard page: a step chart of each selected player nation's
combined ruler skill (`adm + dip + mil`, a real 0-300 range by game
design) across the whole campaign.

**Data source, found not assumed.** `rulerterm_manager.database` has
one row per historical reign — `ruler_type`, `ruler.characters[0].
{character, regnal_number}`, `ruled_type`, `ruled` (the nation idx),
`start_date`, `end_date` — confirmed against a real 642MB save.
`character_db.database.<character idx>` has that ruler's own `adm`/
`dip`/`mil`, `first_name` (a localization key, e.g. "name_birger"),
and optionally `nickname` (already real display text, not a key) and
`country`. `ruler_history` (schema.sql) is the denormalized join of
the two, built once at parse time (1.3.11.ts) rather than a second
table — both maps are already in memory during that pass. Scoped to
`ruled_type=Country` (excludes International Organization ruler terms,
e.g. HRE-style elected titles) and `ruler_type=Character` with a
resolvable character (excludes interregnum/regency terms — no one to
score). No `end_date` column: a ruler's segment end is derived at
chart-build time from the *next* row's `start_date` (or the save's
current date for the last one) — a real, unmodeled interregnum gap
between two reigns simply carries the earlier ruler's value forward
rather than showing a gap, a deliberate simplification (not a
fabrication), documented in schema.sql.

**Column order in `ruler_history` matters beyond readability.**
`insertRows`' bulk-insert path (db.ts) turned out to insert
positionally — DuckDB-Wasm's `insertArrowTable` matches the Arrow
table's field order against the target table's own physical column
order, not by name, despite both carrying field names. Adding
`first_name_key`/`nickname` via a separate `ALTER TABLE` (appending
them at the end) while the adapter's `INSERT INTO ruler_history
(..., first_name_key, nickname, adm, dip, mil)` listed them earlier
caused a real, silent type-mismatch insert failure (a string landing
in a `DOUBLE` column) — caught immediately by the test suite. Fixed by
folding both columns directly into the original `CREATE TABLE`
(this table shipped only within this same session, never to a real
user, so there's no kept-save migration case to preserve) in the same
order the adapter's row tuples use. Documented in schema.sql as a
constraint on this table specifically, since it's not obvious from the
column list alone.

**Real ruler names, not "Ruler #N".** A save's `first_name` is a raw
localization key, not display text — the save carries no localized
strings at all. Resolved the same way 008's Encyclopedia already
solved this exact problem for `game_concepts`: a small dedicated
scraping tool (`tools/ruler-names-scraping/generate.ts`, `npm run
generate:ruler-names -- --install <path>`) reuses `tools/encyclopedia-
scraping/parse-localization.ts`'s existing `parseLocalization` (already
a full recursive scan of every `*_l_english.yml` under the install) and
filters its result to base `name_*` keys (dropping regional-script
variants like `name_birger.greek_language`) into a committed
`src/components/Overview/rulerNames.json` (~4,670 entries, confirmed
against a real install, ~135KB). `rulerNames.ts`'s
`resolveRulerFirstName` falls back to `null` (never a guessed name) for
an unresolvable key; the UI then falls back to a regnal-number-only
label (`Ruler #7`) — real data, not a fabrication — rather than hiding
the ruler entirely.

**Hover tooltip needed its own lookup, not ECharts' default.** A step
chart's tooltip, left to ECharts' own axis-trigger "nearest data point"
logic, picks whichever of the two flanking points is pixel-nearest to
the cursor — wrong on one side of the step's own boundary, since the
step's actual value holds flat from a point until the *next* point's x,
not until the midpoint between them. Fixed with `LeaderboardChart`'s
new `tooltipFormatter` prop (a pass-through to ECharts'
`tooltip.formatter`) plus `axisPointer: {type: "line", snap: false}`
when `step` is set, so the axis position fed to the formatter is the
literal continuous mouse position, not snapped to a data point.
`RulerHistoryChart`'s own formatter ignores ECharts' per-series
nearest-point picks entirely and instead scans its own raw per-nation
reign arrays (already in scope via closure) for the latest reign whose
`start_date <= axisValue` — the actually-correct step value — and
formats the ruler's real name from there.

**Country selection standardized on `AddCountryInput`.** Originally
built for World Goods ("Add country…"), explicit user request made it
the standard control across every Leaderboard chart: `LeaderboardTab`
and `RulerHistoryChart` both replaced their old "Search countries"
toggle-button-plus-`CountrySearchOverlay` panel with this same
always-visible search input (now takes an optional `placeholder` prop;
these two pass "Search countries…", framing it as add-or-remove rather
than add-only), positioned next to the page's own title in a shared
header row instead of a separate control. `LeaderboardChart`'s own
`title` became optional so the page-level title isn't shown twice.

**Ranking view, mirroring `LeaderboardTab`'s own Graph/Ranking
toggle.** Shows each selected nation's time-weighted average ruler
skill (weighted by each reign's real length — a two-year reign and an
eighty-year reign should not count equally) from its earliest recorded
reign through the save's current date, alongside its current ruler's
own skill — `LeaderboardRankingTable` gained an optional
`secondaryValue`/`secondaryTitle` for this second column, driven by
neither column for sort order except the primary (average).

**Two real bugs, found live against a real save, same day.**

- **A "mathematically impossible" average (>300) traced to
  `ruler_history.start_date` being sorted as TEXT.** EU5's date strings
  aren't zero-padded ("1400.2.1" vs "1400.12.1"), so two reigns
  starting in the same year sort lexicographically ("1400.12.1" before
  "1400.2.1", since `'1' < '2'`) whenever their months/days differ in
  digit count — the SQL `ORDER BY start_date` that `listRulerHistoryArrow`
  relies on is therefore only *coincidentally* chronological. An
  inverted pair fed straight into the time-weighted average computed a
  wildly wrong per-segment duration, producing an "average skill" over
  300 for a real nation (Byzantium, ~543 years of reigns) — impossible,
  since every individual ruler's own score is already capped there.
  Fixed in `loadRulerHistory` (leaderboardData.ts): re-sort each
  nation's points by the already-correctly-parsed decimal `year` after
  decoding, rather than trusting the SQL order. This also fixed the
  step chart line itself (same underlying data), not just the ranking
  table. A regression test reproduces the exact adversarial ordering
  (same year, single- vs double-digit months) directly against the DB.
- **The Ranking view's secondary column header didn't line up with its
  own values.** `LeaderboardRankingTable`'s value-column alignment used
  a `td:last-child { text-align: right }` rule with no matching header
  rule — harmless while there were only 3 columns (the header's default
  left-align was close enough to unnoticed), but adding the secondary
  (`Current Ruler Skill`) column silently retargeted `:last-child` from
  the 3rd column to the 4th, right-aligning only the new column's
  *values* while its header stayed left-aligned — a visible
  header/value misalignment the user caught immediately. Fixed with
  explicit `__value-header`/`__value` classes on both the `<th>` and
  `<td>` for every value column, replacing the positional selector
  entirely.

## Societal Values Compass (010) ships: a 14-axis vector-sum projection, and a user-driven redesign that removed half the original spec (2026-09-21)

A new Encyclopedia tab plotting each selected country's ideological
position on a 2D scatter chart, computed by projecting its Societal
Value axes onto fixed angles and summing (mean vector, not raw sum, so
early-game saves with fewer unlocked axes aren't pulled artificially
toward the origin).

**Data source, found not assumed, twice.** `government.societal_values`
turned out to be a flat object of already-signed floats (roughly
-100..+100), not the separate magnitude+direction fields the source
spec assumed — and a raw `-999` is the sentinel for "not yet
applicable," never a missing key or a real zero. Both confirmed against
`tools/schema-mapping/inventories/Russia (Melted).md` before any
ingestion code was written. The `-999` sentinel is dropped at parse
time (`1.3.11.ts`) and never stored — a missing `nation_societal_values`
row *is* "not applicable" for every downstream consumer, the same
row-presence convention `nation_history` already used for other
optional per-nation fields.

**The angle assignment is entirely data, not code.** `axisConfig.json`
maps each axis to one `angleDegrees` (the positive pole's placement;
the negative pole is always `+180°`, never a second config entry) plus
its display labels — `compassPosition.ts` reads this file and has no
axis names hardcoded anywhere. This mattered in practice: the axis
layout went through roughly a dozen live revisions after shipping (see
below), every one of them a JSON edit, zero of them a logic change.

**Shipped, then substantially redesigned live against the user's own
mental model, not a textbook political compass.** After the initial
build (great-power color mode, population/development size toggle, 3
cultural/religious conditional axes, a 4-corner "quadrant name"
legend), the user reviewed it running and drove it somewhere
different: the y-axis formula needed an explicit sign flip
(`y = -value * sin(angle)`, not `+sin`) to make Authoritarian land top
and Libertarian bottom — a real math correction, not a label swap,
documented in `compassPosition.ts`. Great-power status, the size
toggle, and the 3 conditional axes were removed outright ("we don't
need those whatsoever"). The remaining 11 axes were walked one-by-one
onto a full 16-point compass rose (every 22.5°) by explicit bearing,
converted into this codebase's internal angle convention via
`bearing = angleDegrees + 90` and checked axis-by-axis against the
user's own table before writing it. The lesson generalizing past this
one feature: when a visualization encodes a domain-specific mental
model rather than a standard convention, expect the layout itself —
not just the chart's mechanics — to be the thing that needs live
iteration, and keep the mapping in one small data file specifically so
that iteration stays cheap.

**Compass-rose label placement: snap to the nearest straight edge, not
a circle, and grow away from center in both dimensions.** A first pass
placed all 16 labels at a fixed radius around a circle; several sat at
awkward angles or bled into the tinted quadrant backgrounds. Fixed by
projecting each label's bearing onto the bounding *square* instead
(scale by `1/max(|sin|, |cos|)` so whichever axis dominates lands
exactly on that edge) and, per a second bug report, computing
horizontal *and* vertical text alignment independently from which half
of the container the label sits in — not from which edge it nominally
"belongs to." A `verticalAlign: "middle"` on multi-line text was letting
half its rendered height creep back past the anchor into the plot,
worst near a corner where both margins were already thin; anchoring
every label at its own outer corner (grow left/right AND up/down away
from center, whichever isn't already centered) fixed it generally
rather than case-by-case.

**Default view is the player's own country, not every country in the
save.** Reuses `computeDefaultSelection` and `AddCountryInput` verbatim
from Leaderboard/World Goods rather than inventing a third selection
UI — per explicit user request to match the established pattern.

**Known limitation**: live browser verification of the fully-populated
chart was not completed — `claude-in-chrome`'s `file_upload` silently
no-op'd on a real save file in this environment (a session-local tool
limitation, reported upstream), so verification relied on the test
suite (comprehensive: parser, query, and position-math coverage against
real fixture data) plus idle-state browser checks, not a rendered
screenshot with live data.

## Expanded Atlas Map Modes (011) ships: 8 new layers, and a hard rule against trusting the trimmed fixture for field existence (2026-09-21)

Eight new `mapLayers.ts` entries (Development, Location Terrain, Location
Rank, Primary Culture, Primary Religion, Location Market, Tax Base,
Soldiers) on top of feature 005's four. Three originally-requested modes
(Location Wealth, Food Productivity, Sailors) were dropped entirely —
no genuine per-location field backs any of them in the real save,
confirmed by direct inspection, not by absence in the trimmed fixture.

**The trimmed fixture is not a source of truth for "does this field
exist."** `tests/fixtures/rus-1628-minimal.eu5` was hand-minimized for
earlier features and silently omits anything they never read. Early in
this feature, grepping it for `wealth`/`soldiers`/`food` came up empty
and was reported as "not in the save" — wrong on two of three: `soldiers`
turned out real (nested under `population.pop_stats.soldiers`, a
sub-object the fixture's sample locations don't carry), caught only
because the user, looking at the live game, pushed back immediately.
Every field this feature ships was re-confirmed against the real, full
save (`/Users/halda/Downloads/Russia (Melted).eu5`) before being wired
up; the fixture was only extended afterward, once each field's real name
and shape were known.

**Two of three "obviously present" attributes turned out not to exist
as location-level save data at all.** `wealth` never appears anywhere in
the save under any name — the one plausible-sounding candidate
(`value_flow`) was rejected after checking its actual distribution
(median 1.78, max ~2 trillion — not a currency figure). `food` doesn't
exist per-location either, confirmed by grepping the entire ~5.67M-line
`locations.locations` block for zero matches; it only exists one level
up, on `provinces`. Per constitution Principle IV, neither was
approximated from a coarser-grained figure — both were dropped from
scope rather than shipped as a misleadingly location-grained reading of
province/country data.

**`culture`/`religion` resolve to real names and real in-game colors,
not a generated fallback palette.** `locations.culture`/`.religion` are
bare numeric ids — same opaque-id shape `population.culture`/`.religion`
already had since feature 002/004, never resolved anywhere in the app.
The save's own `culture_manager`/`religion_manager` sections (not
previously in `1.3.11.ts`'s `STRUCTURED_KEYS`) turned out to carry both
a real `name` and the game's own `color` per id — so two new small
reference tables (`cultures`, `religions`) plus a join replaced what was
originally planned as another RGO-style generated-fallback-color layer.

**Location Terrain is generated-and-committed reference data, not a
save field or a topojson-embedded property.** Terrain never appears in
a save at all — it's static per-location-name data in the game's own
`location_templates.txt` install file. Rather than bake it into
`public/map/locations.topojson` (feature 003's asset, whose location
features today carry only `name`), a new one-off script,
`tools/map-generation/generate-terrain-lookup.ts`
(`npm run generate:terrain -- --install <path>`), writes a committed
`locationTerrain.ts` lookup — the same generation-then-commit shape
`rgoGameColors.ts` already established, joined by the same location
`name` key the map already uses at runtime (confirmed directly in
`MapCanvas.tsx`'s `dataset.get(polygon.name)` — a `queries.ts` doc
comment elsewhere claims `idx` became the join key in a later revision;
that never actually shipped, the runtime code still keys by `name`).

**One quiet gap closed in passing**: `locations.development` was in the
schema and parser since feature 001/005, but `listMapLocationsArrow`
never actually selected it and `MapLocationRow` never carried it — the
existing four layers just never needed it. Adding the Development layer
here required adding the column to the query and row type first, the
same shared-infrastructure change every other new field in this feature
needed.

**Every numeric layer got its own gradient, not a copy of Population's
blue.** A shared `numericLayer(...)` factory in `mapLayers.ts` reuses
Population's log-normalized, per-dataset-memoized shading (never
touching Population's own code), but Development/Tax Base/Soldiers each
supply distinct low/high colors (amber, green, red) so a user can tell
which of the resulting 12 layers is active without reading the sidebar
label.

**Post-ship corrections (2026-09-21, same day): a real stroke, and two
Location Market fixes.** Three issues surfaced from user review against
a live save (screenshots in `specs/debug_images/`):

- `MapCanvas.tsx` never drew a stroke at all — every location was its
  own separately-filled path with no border, so what looked like
  location boundaries at a normal zoom was actually the page background
  showing through incidental sub-pixel anti-aliasing gaps between
  adjacent fills. That gap shrinks below a pixel and vanishes entirely
  at world-zoom (the whole map in view), making same-owner regions read
  as one smooth blob instead of thousands of individual locations — not
  a rendering bug exactly, but confusing enough to fix properly. Now
  draws a real `ctx.stroke()` per polygon, with `lineWidth` divided by
  `dpr * view.scale` so the border stays a constant ~1 screen pixel at
  any zoom level instead of growing with it.
- The Location Market layer was coloring water tiles: a market's raw
  save membership can include coastal/open-water locations for naval
  trade-route purposes, but painting them as if they were land territory
  misrepresented the layer. Fixed by cross-referencing `locationTerrain.ts`
  (already generated for the Terrain layer) — any location whose
  topography is one of 8 confirmed water categories is now excluded from
  both the fill and the market color/name assignment.
- The legend/tooltip showed a bare `Market <idx>`, not useful without
  cross-referencing the Markets tab. `listMapLocationsArrow` now joins
  `markets` then self-joins `locations` again on `center_location_idx`
  (aliased `market_center`), reusing `listMarketsArrow`'s exact
  `COALESCE(name, 'Location ' || idx, 'Market ' || idx)` fallback chain —
  every market is labeled by the real location it's centered on.

**Development went red-to-green, ranked not value-scaled (2026-09-21,
user request).** The shared `numericLayer(...)` helper (log-normalized
against the dataset's raw max, same as Population) bunched most
locations into near-identical shades whenever development was
skewed — asked to make differences "more visually telling," so
Development got its own bespoke implementation: each location's color is
its *percentile rank* among all developed locations (`i / (count - 1)`
in sorted order), not a function of its raw value at all. Rank spreads
every location evenly across the full red-green gradient by
construction, regardless of how skewed the underlying distribution is —
Tax Base and Soldiers still use the original value-scaled
`numericLayer` helper, unchanged.
