# Architecture

NauticalBeg is a client-only web app: everything — reading the save file,
parsing it, storing the parsed result, and rendering it — runs in the
browser. There is no backend (see
`specs/001-save-import-overview/plan.md`): the public site is static
files on Cloudflare Pages, deployed by GitHub Actions (see "Public
hosting (016)" below).

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
an unverified simplification.

Production sends the same two headers from `public/_headers` (Cloudflare
Pages applies it; see "Public hosting (016)"). Keep the two copies in
sync. `npm run check:dist` fails the build if `_headers` is missing
either one.

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

## Firepower (012) ships: three new generated reference tables, a display-name/internal-keyword mismatch, and a real Arrow-insert gotcha (2026-09-21)

A new "Firepower" Factbook tab — Military Doctrine (reuses feature 010's
`nation_societal_values` unchanged, for the three military axes that
feature deliberately excluded), Army Stats, and Navy Stats. New tables:
`regiments`, `nation_advances`, `nation_reforms`, `nation_privileges`,
`nation_laws`, `war_unit_losses`; new `nations` columns (manpower,
sailors, monthly_manpower, monthly_sailors, army_tradition,
navy_tradition, last_months_army_maintenance, last_months_navy_maintenance,
primary_culture_idx) and a `cultures.culture_group` column (added but
not yet populated — see below).

**A stat's display name can outright mismatch its internal save/game
keyword — "Fort Defense" is real, but its internal name is
`global_defensive`, not `fort_defense`.** A first research pass grepped
`game/in_game/common/` for the literal string `fort_defense`, found
nothing, and concluded the stat didn't exist in EU5 at all — wrong,
caught only because the user (who plays the game) disputed it directly.
The real keyword turned up only by grepping the game's own GUI/
localization files (`in_game/gui/military_ledger.gui`'s
`Country.GetDescriptionFor('global_defensive')`,
`modifier_types_l_english.yml`'s `MODIFIER_TYPE_NAME_global_defensive:
"Fort Defense"`) — once known, it had the widest source list of any of
the five computed Army Stats (~80 entries across laws, reforms,
advances, estate privileges, religions, chivalric orders, subject types,
international organizations, gods/avatars, and bureaucracies). Same
lesson as feature 011's fixture-trust rule, one level up the stack: when
a grep for the expected internal name comes up empty, that's evidence
the name is wrong, not that the thing doesn't exist.

**Discipline, tactics, fort limit, siege ability, and fort defense are
computed, not stored.** None of the five appear anywhere in a save —
the game computes them live from researched advances, government
reforms, estate privileges, and active military laws (a save field,
`government.implemented_laws`, not previously parsed — grouped by law
category, one active choice per category, structurally identical to
`implemented_reforms`/`implemented_privileges`). Three static reference
tables (`unitTypeReference.ts`, 259 entries; `unitUnlockReference.ts`,
175; `militaryModifierReference.ts`, 213, generated by
`tools/firepower-reference/generate-*.ts` against the local game
install, same commit-the-resolved-table pattern as
`rgoGameColors.ts`/`locationTerrain.ts`) resolve unit type → category/
age/levy, advance → unit unlock, and source → stat contribution. Every
computed total is explicitly marked partial (a visible `*` plus a
footnote, not a bare number) since character/leader trait contributions
are excluded — no character parsing exists in this codebase at all.
`sourceKind: 'dynamic'` entries (values that scale with runtime state
this app doesn't parse, like army-tradition-scaled bonuses) and
`sourceKind: 'other'` entries (cataloged but never joined against save
data) are also excluded from the sum by design, not by omission.

**`insertRows`' bulk Arrow-insert path silently requires every physical
column of the target table, not just the ones named in the `INSERT`
statement's own column list.** Adding `cultures.culture_group` via
`ALTER TABLE` (6th column) broke every single insert in the adapter with
`"table cultures has 6 columns but 5 values were supplied"` — the
existing `cultures` insert's SQL still only named 5 columns, which reads
as a normal, safe partial-column insert, but `db.ts`'s
`insertArrowTable(arrowTable, { name: tableName, create: false })` call
underneath needs the Arrow table's column count to match the physical
table's column count exactly, regardless of what the SQL string's own
column list says. Fixed by always supplying every physical column
(`culture_group` as an explicit `null`) — a real, easy-to-hit trap for
any future `ALTER TABLE ADD COLUMN` on a table an existing bulk insert
already writes to.

**Levy vs. regulars and navy damage given/taken both turned out to be
real, save-derivable figures — not gaps needing the planned "omit the
column" fallback.** Levy status is a genuine per-unit-type flag
(`levy = yes/no` in `unit_types/*.txt`) with matching `_levy`-suffixed
concrete types (`a_peasant_levy`, `a_matchlock_levy`) actually appearing
in `subunit_manager.database[*].type` — folded into
`unitTypeReference.ts` rather than a separate lookup. Navy damage
given/taken has no dedicated save field, but reuses
`war_manager.database[*].attacker_losses`/`defender_losses`, the same
per-war structure feature 008's `wars.attacker_casualties`/
`defender_casualties` already derives from — `sumLosses()`
(`1.3.11.ts`) was widened to also preserve the per-category breakdown in
a new `war_unit_losses` table (filterable to `navy_%`-prefixed
categories) rather than just the flat total, with the existing
casualties columns' own derivation left byte-for-byte unchanged
(confirmed: no regression in feature 008's own tests).

**A single combined query described in `contracts/queries.md` was split
in two during `tasks.md`, specifically so Army Stats and Navy Stats stay
independently buildable.** `listNationMilitarySourcesArrow` (spanning
advance/reform/privilege/law sources) would have made Navy Stats'
unlock-age columns depend on Army Stats' `nation_reforms`/
`nation_privileges`/`nation_laws` tables existing — split into
`listNationAdvanceNamesArrow` (Foundational, shared) and
`listNationGovernanceSourcesArrow` (Army Stats-only), so the two user
stories share only what's genuinely common.

**`cultures.culture_group` exists in the schema but is never populated
yet** — resolving it needs a fourth static reference table this feature
didn't build (culture → culture group, from
`game/in_game/common/culture_groups/`), so any unique unit unlock gated
by culture group (a minority of `unitUnlockReference.ts`'s ~175 entries)
is treated as ungated for now — an explicit, documented
over-inclusion-only simplification (`armyNavyStats.ts`'s
`computeUnlockedAge`), not a silent gap.

### Post-ship (same day): hover breakdowns, head-to-head comparison, alternating row color, doctrine marker overlap

Four follow-ups from live-save user review, same day as the initial ship:

1. **Alternating row background** on `ArmyStatsTable`/`NavyStatsTable`
   (shared `ArmyStatsTable.css`) plus a hover row highlight.
2. **`PartialStat` now carries its own `breakdown`** (every matched
   `militaryModifierReference.ts` entry, kind + name + value) alongside
   the total — `computeModifierTotal` returns it, `formatBreakdownTooltip`
   (`militaryStatFormat.ts`) renders it, so "why is this 0.10?" is
   answerable by hovering rather than opening the source file.
   **Immediately reported broken against a real save loaded manually**
   ("hover isn't showing anything") — root cause: this originally used
   the native `title` attribute, which has a real, user-visible ~1-1.5s
   delay in most browsers and is trivially easy to miss on a dense
   table (confirmed via direct DOM inspection that the data itself was
   always correct — the breakdown/title text was present and accurate,
   just not perceived). Replaced with `HoverTooltip.tsx`, a small
   reusable component showing a styled, instantly-appearing popover on
   `mouseenter` (`position: fixed` from the trigger's own bounding rect,
   so it escapes the stat tables' `overflow-x: auto` clipping) — used by
   every hover surface this feature has (stat breakdowns, doctrine
   markers, head-to-head cells, regiment composition below).
3. **`MilitaryDoctrineChart` markers within `OVERLAP_THRESHOLD` (4 axis-
   units) of each other now stack onto separate vertical rows**
   (`militaryDoctrineLayout.ts`'s `assignOverlapRows`/`rowOffsetPx`,
   zigzagging out from track center) instead of drawing on top of each
   other; each track's height grows to fit however many rows it actually
   needs. Hover text now also lists every real
   `militaryModifierReference.ts` `societal_value` entry for that axis
   (`doctrineModifiersForAxis`), each marked active/inactive against the
   country's real position (same ±99 extreme threshold
   `computeModifierTotal` uses) — `land_vs_naval` currently has none
   (confirmed, not a bug: `MILITARY_MODIFIER_REFERENCE` has zero
   `land_vs_naval` entries), so its tooltip says so plainly rather than
   fabricating an effect.
4. **A two-column head-to-head view** (`HeadToHeadTable.tsx` +
   `headToHeadRows.ts`'s `buildArmyHeadToHeadRows`/
   `buildNavyHeadToHeadRows`) appears as a "Compare head-to-head" toggle
   on Army/Navy Stats whenever exactly two countries are selected,
   falling back to the normal wide table with an explanatory note if
   either side has no army regiment/ship yet. The larger raw value per
   row is bolded as a neutral "which number is bigger" cue — deliberately
   not a green/red "better/worse" judgment, since that varies by stat
   (e.g. lower maintenance isn't unambiguously "better" strategically)
   and this app doesn't make that call.
5. **Regiment/ship counts decompose on hover into their real
   composition** (explicit user request) — `regimentClassifier.ts`'s
   `classifyRegiments` now also returns `byUnitType` (per-raw-unit_type
   totals, unaggregated, sorted by size), exposed as `regimentBreakdown`
   on `ArmyStatSummary` and four per-category breakdowns
   (`heavyShipBreakdown`/etc.) on `NavyStatSummary` since Navy has no
   single aggregate ship-count column. `formatRegimentBreakdownTooltip`
   (`militaryStatFormat.ts`) renders e.g. "Baggage Train: 1412 (48
   regiments)\nHeavy Lancers: 606 (54 regiments)" — confirmed against
   the real save. `formatUnitTypeName` strips the save's `a_`/`n_`
   prefix and title-cases the rest; this project has no access to the
   game's actual localization strings (Constitution Principle IV), so
   this is a readable rendering of the save's own identifier, not a
   claim it matches the in-game display name verbatim.
6. **Monthly Manpower (Army Stats) and Monthly Sailors (Navy Stats)
   removed** from both `ArmyStatSummary`/`NavyStatSummary` and every
   view that surfaced them (table column, head-to-head row) — explicit
   user request. The underlying `nations.monthly_manpower`/
   `.monthly_sailors` columns, their parsing, and
   `listNationMilitaryScalarsArrow`'s query were deliberately left in
   place rather than torn out too: they're correct, already-parsed real
   save data, cheap to keep, and reusable if a future feature wants
   them — removing already-working storage/parsing infrastructure
   wasn't part of what was asked.
7. **Every column in both stat tables is now sortable** (explicit user
   request) — `useTableSort.ts`, a small generic hook (click a header to
   sort ascending, click again for descending, click a different header
   to switch columns back to ascending) shared by `ArmyStatsTable` and
   `NavyStatsTable` via `SortableHeader.tsx`. A row with a `null` value
   for the sorted column always sorts last in both directions, never
   treated as 0 (Constitution Principle IV) — the "no maintenance
   figure recorded" case Army Stats already has real examples of.
8. **Military Doctrine redesigned from three independent strip plots
   into one ECharts `parallel` (parallel-coordinates) chart** (explicit
   user, detailed spec: countries need to be trackable across all three
   axes at once for cross-axis correlation, and same-value labels were
   colliding on the old per-axis rows). One polyline per country
   crossing all three axes (fixed order: Land↔Naval, Offensive↔
   Defensive, Quality↔Quantity) at its real value, in the confirmed real
   -100..+100 domain (not a guess — `62.4`, `-18.9`, `99.88381` were all
   seen directly in the real save this session), reusing each country's
   real map color. The hover-highlight-and-fade-to-~20%-opacity
   interaction — "the core interaction that makes parallel coordinates
   usable," per the spec — turned out to be a genuinely-supported
   built-in ECharts capability for this series type at runtime
   (`emphasis: {focus:'self', blurScope:'series'}` + `blur.lineStyle.opacity`),
   confirmed by reading the installed echarts version's own
   `ParallelView` source (every line element gets
   `toggleHoverEmphasis` wired unconditionally) *and* by live-testing
   against the real save — no hand-rolled per-line opacity/React-state
   bookkeeping needed, contrary to the original plan of reaching for
   `echarts.getInstanceByDom` + manual event wiring. `blur` isn't in
   this echarts version's shipped `ParallelSeriesOption` TypeScript
   type despite being a real runtime option, so that one series object
   is built as `Record<string, unknown>` and the whole `option` cast
   through `unknown` rather than fighting the incomplete type. Axis pole
   labels (e.g. "Land"/"Naval") are rendered via each `parallelAxis`'s
   `axisLabel.formatter` returning the pole name only at exactly
   `min`/`max` (an `interval: 100` forces ticks to land exactly on
   `-100`/`0`/`100`) — cheaper than the old strip-plot chart's
   percentage-position graphic-element math. A country missing an axis
   (the `-999` sentinel, already filtered to `null` upstream) gets no
   vertex there at all — confirmed via the same `ParallelView` source
   (`isEmptyValue`/`createLinePoints` explicitly skip a `null`/`NaN`
   dimension when building a line's points) rather than plotting a
   fabricated centrist value. A persistent tag+color legend below the
   chart replaces permanent on-chart labels, which the old design
   already knew would collide past a handful of countries.
   `assignOverlapRows`/`rowOffsetPx` (the old strip-plot overlap-
   avoidance math) were removed outright — a parallel-coordinates line
   has no equivalent overlap problem to solve.
9. **The doctrine tooltip's per-axis modifier breakdown replaced with a
   one-sentence plain-language summary** (explicit user request,
   e.g. "Expect to fight a naval-focused, offensive and high-quantity
   military.") — `describeDoctrine` (`militaryDoctrineLayout.ts`) picks
   one descriptor per axis whose score is more than `NEUTRAL_THRESHOLD`
   (25, the user's own example boundary) from zero in either direction,
   joins whichever descriptors qualify, and falls back to an honest
   "balanced, doctrine-neutral" sentence when none do (never an empty or
   fabricated one) — same treatment for a locked (`-999`-sentinel,
   already-`null`) axis as a genuinely neutral score: both are simply
   left out. `doctrineModifiersForAxis` and the active/inactive modifier
   lines it drove were removed outright (no other caller) rather than
   left as dead code alongside the new sentence.

## Diplomatic Relations Chord Diagram (013) ships: dual echarts series sharing one geometry, bounded on-demand queries, and a directional-treaty derivation confirmed against the real save (2026-09-22)

A new Diplomacy tab (`DiplomacyTab.tsx`/`DiplomacyChordChart.tsx`/
`DiplomacyFilters.tsx`/`diplomacyData.ts`/`hugboxClustering.ts`) renders
countries as circle nodes on an ellipse, with chords for active diplomatic
relationships (alliance, rivalry, royal marriage, guarantee, military
access, food access, fleet basing rights, economic support) parsed from
`diplomacy_manager` (`1.3.11.ts`) into two new tables, `diplomatic_relations`
and `nation_relation_trust` (see `specs/013-diplomatic-relations-chord/`
for full contracts).

1. **echarts `graph` + `custom` dual-series chord diagram**, not a single
   built-in chart type — `graph` gives native `emphasis.focus: "adjacency"`
   hover-isolate almost for free but can't draw an arbitrary node shape with
   per-node label rotation, so a `custom` series draws the visible circles/
   labels on top of invisible `graph` nodes that own the actual edges. Two
   real bugs came from these being two independent renderers:
   - **Z-order**: even with correct `zIndex`, a `custom` series and a
     `graph` series live on different internal render passes, so a chord
     could paint over a node during hover regardless of declaration order.
     Fixed with `zlevel` (a genuinely separate zrender paint layer, unlike
     `z`/`zIndex` which only order *within* one layer) — `graph` at
     `zlevel: 0`, both `custom` series at `zlevel: 1`.
   - **Geometry drift**: `custom` series `renderItem` re-measured
     `api.getWidth()/getHeight()` on every call while `graph` node
     coordinates came from React's own `ResizeObserver`'d `size` state —
     two independently-measured ellipses that could disagree by a pixel,
     visible as a chord ending just short of its node's center (reported
     via a debug screenshot, `specs/debug_images/`). Fixed by computing the
     ellipse geometry once per `useMemo` and closing over that single object
     in every `renderItem`, so there is exactly one source of truth.
2. **Directional treaties derived from container type, not a stored flag**:
   the save has no explicit "is this one-way" field on a
   `scripted_mutual`/`scripted_oneway` entry — direction was derived by
   exhaustively cross-tabulating every real occurrence in a loaded save:
   `alliance` is always under `scripted_mutual` (symmetric), every other
   treaty type including `guarantee` is always under `scripted_oneway`
   (directional, first→second). `royal_marriage`/`rivalry` are symmetric by
   construction (no directional container); `economic_support` is
   directional by nature (a one-sided grant). This dictates a normalization
   rule reversal in `addRelation()`: only symmetric rows get
   `first_nation_idx < second_nation_idx` sorting for dedup purposes —
   directional rows keep the save's own first/second order since it's now
   semantically meaningful (which side arrows point at).
3. **No stored "opinion" scalar** — confirmed by exhaustively listing every
   field a real `diplomacy_manager.<idx>.relations.<target>` entry carries
   (`trust`, `disposition`, `timed_biases`, `last_war`, `war_score`, etc.,
   no `opinion=`). `opinion_score` is derived as a plain sum of every
   `timed_biases.Opinion[].value` and `.Antagonism[].value` for that pair
   (`Antagonism` entries are already negative in the save, no sign flip
   needed) — disclosed in the UI as a derived figure, not claimed to match
   the in-game ±200 display scale exactly (Constitution Principle IV).
4. **Bounded, on-demand queries, not save-wide** — the diagram was
   reported slow against a 100+-tag save. `listDiplomaticRelationsArrow`/
   `listRelationTrustArrow` take `nationIdxs` and scope with
   `WHERE first_nation_idx IN (...) AND second_nation_idx IN (...)`; player
   (human-played) countries load automatically as the default selection,
   every other country loads only once added via search, and a
   relationship-type filter toggle never re-queries (still client-side, per
   SC-003's under-1-second budget) — only a selection change does.
5. **"Missing alliances" turned out to be a stale kept-save cache, not a
   parser bug** — investigated by extracting all 38 real alliances from the
   save via `awk` and cross-referencing against what the client actually
   received (confirmed correct at every layer via temporary diagnostic
   logging). Root cause: "Resume this save" reopens an already-parsed
   OPFS-backed DuckDB database without re-running the parser, so newly
   added parser logic (the relationship-type widening) was invisible until
   a fresh upload. Reinforces the standing lesson from 011: a kept-save
   session can silently mask a parser change — always suspect it first
   before concluding a data bug when a save has been open since before an
   edit to `version-adapters/`.

## Pseudo-3D map extrusion: a Canvas-only prototype, unshipped (2026-09-22)

Explored whether Population/Development/Tax Base map modes could read as a heat/elevation relief on top of the existing flat choropleth fill — user request, framed as adding "a 3D effect... increase their heat or something like that." `MapCanvas.tsx` is plain Canvas 2D — no WebGL/shader pipeline anywhere in this codebase (confirmed by a targeted search before starting) — redrawing ~28,573 polygons every frame with real performance headroom already spent (world-wraparound duplication was reverted earlier for exactly this reason, per that file's own comment). A full WebGL rewrite was ruled out as too large a lift for what started as an exploratory ask; a cheap Canvas-only fake-3D trick was prototyped instead.

**What shipped**: `MapLayer.getHeight?()`, an optional 0..1 value each numeric layer can supply alongside its existing `getFill()` — only Population/Development/Tax Base implement it (their existing rank value, reused as-is so height and color intensity always agree); every categorical layer is unaffected and pays zero extra draw cost. `MapCanvas.tsx` draws a location twice only when its active layer has height: an unshifted, darkened "shadow" copy first, then the real fill shifted up by `height * EXTRUSION_MAX_CSS_PX / view.scale` — dividing by `view.scale` cancels the zoom factor the same way `BORDER_WIDTH_SCREEN_PX` already does elsewhere in that file, so the apparent height stays a constant few CSS pixels regardless of zoom rather than growing/shrinking with it. Reads as a subtle embossed/relief look, not true 3D; verified live against the real save with no measurable pan/zoom performance regression.

**Deliberately marked experimental in code** (`EXPERIMENTAL (prototype, unshipped)` doc comments throughout `MapCanvas.tsx`/`mapLayers.ts`) — this was never run through `/speckit-specify`, has no `specs/NNN-.../` directory of its own, and its tuning constants (`EXTRUSION_MAX_CSS_PX`, `EXTRUSION_SIDE_DARKEN`, `EXTRUSION_MIN_T`) are left as inline module constants rather than promoted to a settings/config layer, pending a decision on whether to formalize this as a real feature.

## Save Format Support (015): every EU5 save format, melted in-browser (2026-09-25)

Until 015 the app read only **uncompressed text** saves (`SAV…00`): debug-mode
saves, or ones pre-converted with `rakaly melt`. The game actually writes
**compressed binary** saves (`SAV…03`, ironman and multiplayer included):
a binary metadata block, then a zip holding `gamestate` and `string_lookup`.
Those used to pass the "is this a save" check and then fail deep inside
jomini.

**Design: melt, then reuse the one text pipeline.** `save-format.ts`
reads the header's kind code (six kinds, from jomini's envelope: 00 text,
01 binary, 02/03 zip text/binary, 04/05 split zip). Kind 00 goes to the
existing parser untouched. Every other kind goes through
`parser/melter/melt.ts`, which turns it into the same plaintext
`rakaly melt` would produce, and then `detectVersion`, the `1.3.11`
adapter and every tab run unchanged. One parser to maintain; downstream
output is identical by construction. `tests/parser/load-save-formats.test.ts`
checks this table by table.

**The melter is our own Rust→WASM build of an MIT crate, not pdx-tools.**
`tools/eu5-melter/` wraps rakaly/jomini's `eu5save` crate (MIT, vendored at
rev `4461f6e` with one patch, see below). pdx-tools' compiled EU5 module
was ruled out because pdx-tools is **AGPL-3.0**. The built WASM (~294KB,
~120KB gzipped) and its glue are **committed** under
`src/parser/melter/generated/`. `npm run dev`/`build`/`test` never need
Rust; only `npm run build:melter` does, and it needs rustup's toolchain
(Homebrew's `rustc` has no wasm32 target, so `build.sh` puts
`~/.cargo/bin` first on PATH).

**Token table: pdx.tools' file, used with permission.** Binary saves store
field names as u16 IDs. Paradox doesn't publish the mapping. We ship
pdx.tools' EU5 table as `public/tokens/eu5.flat`, used with permission
granted 2026-09-24; `public/tokens/README.md` records provenance and
hashes. The flat layout's ID rule has a gap at the breakpoint
(`id > 9999 → entries[id - 1]`). A naive `entries[id]` looked almost right
but silently shifted every high-range key by one slot. That was only
caught by diffing against `rakaly melt`, and `tokens.rs` tests now pin it.

**Version overrides.** The pdx.tools table comes from a newer game
version. Token `0x28de` is `unused_strength` there but `strength` in 1.3.11
saves, and without the fix the Firepower tab's regiment strength came out
silently empty. `melter/token-overrides.ts` holds per-version corrections.
`melt.ts` picks them by melting only the metadata first and reading
`metadata.version`. `tools/eu5-melter/cross-check.mjs` compares our melt
key-by-key against rakaly's. On the real 1.3.11 MP save it reports **no
differences**; rerun it whenever the table, overrides or a supported
version changes.

**Upstream fixes carried locally** (`tools/eu5-melter/vendor/eu5save/PATCHED.md`, `src/lib.rs`):
- Lookup-table strings containing spaces were melted unquoted
  (`Custom_Name=Lil Israel`, 138× in the real save). They're now quoted.
- Zipped *text* saves were rejected unless the zip also had a
  `string_lookup` entry. They're now unzipped directly.
- A truncated compressed save "melted" into garbage, because jomini falls
  back to "uncompressed" when it can't find a zip. It's now reported as
  `damaged-save` whenever the header declares a zip but none is found.

**Memory.** Output streams out of WASM in 8MB chunks into a JS-owned
buffer, pre-sized from the zip's declared gamestate size × 2.2 (a real
save needs no regrowth), so the ~650MB result never lives in WASM linear
memory. Linear memory never shrinks, so `melt.ts` calls wasm-bindgen's
`__wbg_reset_state()` (built with `--experimental-reset-state-function`)
after every melt. That hands the input copy and inflate buffers to the GC
before DuckDB ingestion starts.

**Cancellation (real bug found in the browser).** The melt runs
synchronously inside the Worker, so a cancel or superseding load sent
during it can only queue. A superseded binary load used to keep going
after the melt: it posted "Parsing save…" over the newer load's result
and left its OPFS database behind. `loadSave` now suppresses progress
once aborted, yields to the event loop after the melt so a queued cancel
is seen, and `signal.throwIfAborted()`s at every adapter milestone and
before `onReady`, so an aborted load stops and `finally` deletes its
database. One limitation remains: the newer load only starts once the
in-flight melt returns, since the Worker is single-threaded.

**Measured on the real 84MB `MP_RUS_1628` save** (dev server, Chrome
automation tab):

| | Compressed binary | Melted text (642MB) |
|---|---|---|
| decompress/melt | 23.4s | n/a |
| total to Overview | **139.2s** | 112.3s |
| Overview figures | identical | identical |

That's 1.24× the melted file's load time, inside SC-003's 1.5×. The same
melt takes **6.0s** in Node, including with forced unoptimised
WebAssembly (`--liftoff --no-wasm-tier-up`), and 17.6s in a bare Chrome
page with the automation debugger attached. So the in-browser melt time
is inflated by the instrumented session; it still needs timing in an
ordinary Chrome window.

New error kinds: `unrecognized-format`, `damaged-save`,
`binary-unavailable`. `ready` gains `warnings` (unknown tokens), shown by
`LoadWarningNotice`. There is a new progress phase, `decompressing`.

**Test-suite disk leak fixed along the way.** `tests/helpers/duckdb-test-env.ts`
created a `nauticalbeg-duckdb-test-*` temp folder per test file and never
deleted it. About 3,200 had built up to **166GB** and filled the disk
mid-feature. It now removes its folder in `afterAll`, with a process-exit
backstop.

## Public hosting (016): static files on Cloudflare Pages, deployed by GitHub Actions (2026-09-25)

The app is served as plain static files from Cloudflare Pages on its free
`*.pages.dev` address. There is still no backend: saves are parsed and
stored in each visitor's own browser exactly as in local development.

**Pipeline** (`.github/workflows/ci.yml`, contract in
`specs/016-public-hosting-pipeline/contracts/pipeline.md`):
- `check` job, on every push to `main` and every pull request: `tsc -b`,
  the vitest suite, `vite build`, then `npm run check:dist`. No secrets.
- `deploy` job, only after `check` passes: uploads the exact `dist/` that
  was tested (it is never rebuilt) with `wrangler pages deploy`. Pushes to
  `main` go to production. Pull requests from this repo go to a preview
  address that gets posted on the PR. Fork PRs never deploy.
- Rollback is Cloudflare's "Rollback to this deployment" button, which is
  instant and doesn't rebuild. Setup, rollback and token rotation are in
  `docs/hosting.md`.

**The DuckDB engine `.wasm` comes from jsDelivr in production.** Pages
rejects any file over 25 MiB, and both engine files are larger (eh 34MB,
mvp 39MB). `src/storage/engineUrls.ts` gives production builds
`https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@<version>/dist/duckdb-{mvp,eh}.wasm`,
with `<version>` read from the installed package at build time
(`__DUCKDB_VERSION__` in `vite.config.ts`), so the binary always matches
the bundled JS glue. Details:
- The worker scripts stay self-hosted, because a cross-origin URL can't be
  passed to `new Worker()`.
- `db.ts` imports the local `.wasm` files only inside a `!import.meta.env.PROD`
  branch, so they drop out of the production build entirely. The build went
  from 126MB to 58MB.
- jsDelivr sends `cross-origin-resource-policy: cross-origin`, so it loads
  under our `require-corp` header. It also serves the file Brotli-compressed
  (~7MB for eh) with a one-year immutable cache.
- If the download fails, `db.ts` throws `EngineUnavailableError`. The loader
  reports it as the `engine-unavailable` error kind ("check your
  connection") instead of blaming the save.
- It's recorded in the security constitution §6, alongside the one other
  third-party request: Google Fonts, `@import`ed by `src/styles/tokens.css`
  since 001. That one was only noticed during 016's browser check, and
  whether to self-host the fonts is an open decision.

**Caching** (`public/_headers`): `/assets/*` files have content-hashed
names and are cached immutably for a year. `index.html` and the fixed-name
data under `map/`, `encyclopedia/` and `tokens/` use Pages' default ETag
revalidation, so a return visit costs "not modified" replies rather than
re-downloads, and a new deploy is picked up on the next load.

**`check:dist`** (`tools/check-dist/check-dist.ts`) fails the pipeline on
any file over 25 MiB, any image/texture file (so game art can't ship by
accident), or a `_headers` missing an isolation header.

**Small app additions**:
- `src/browserSupport.ts` checks for WebAssembly, Web Workers and a
  *working* OPFS (Firefox private windows expose `getDirectory` but reject
  it). If anything is missing, the app shows a plain message instead of
  the loader.
- The footer shows the fan-tool notice and `v<short SHA>`
  (`__APP_VERSION__`).

**Tests in CI**: test and hook timeouts are 60s (`vitest.config.ts`),
because DuckDB-heavy tests exceed the 5s default on busy machines and
small runners. The long-flaky `RulerHistoryChart.test.tsx` had two real
races:
- spy call history leaked between tests (no `restoreAllMocks`), so a
  `toHaveBeenCalledWith` wait could pass on an earlier test's call;
- assertions read the chart's latest props right after the data *call*,
  not after the re-render with the data. Before the selection resolves,
  the chart already renders once with an empty history.

Both are fixed. The file now passes 30/30 sequentially and 30/30 under
10-way concurrent stress. A first fix that only waited for the axis range
still failed 15 of 30 under that stress, which is how the empty-history
render was found.

**Map view lock (post-016, 2026-09-25)**: `MapCanvas.tsx` no longer lets
the map shrink below the canvas or be panned past its edges. The old fixed
`MIN_SCALE = 0.5` allowed empty space around the map. `mapView.ts`'s
`clampView` enforces a "cover" floor (the world fills the canvas) and edge
clamping, and `draw()` applies it every time, so canvas resizes are
re-clamped too. The view starts fully zoomed out at the cover scale.

## Game state sharing (017): one-week links, Arrow + Brotli, Pages Functions + R2 (2026-09-25)

This is the project's first server component. It's opt-in per share, and it
only stores data. Details: `specs/017-share-game-state/`; the user-facing
retention statement is in `docs/sharing.md`.

**What's shared is the parsed database, not the save.** Every tab reads only
the per-save DuckDB. So a share is that database exported as one Arrow IPC
stream per table:
- `raw_sections` is excluded, and `save_meta.filename` becomes "Shared game"
  (`src/share/exportSnapshot.ts`)
- the streams are packed into an `NBSNAP` container with a JSON manifest
  (`src/share/snapshotFormat.ts`)
- the container is Brotli-compressed at quality 5 in a Worker
  (`src/share/compress.worker.ts`, `brotli-wasm`)

Measured on the real 85MB multiplayer `MP_RUS_1657` save:

| Stage | Size |
|---|---|
| Tables as Arrow IPC | 181MB |
| gzip (the only compression browsers have built in) | 51MB |
| **Brotli q5** | **13MB, in about 2s** |

Most of the size is `nation_relation_trust`: 4.6M rows of genuinely dense
nation-pair trust and opinion values.

**Dead end: Parquet.** This DuckDB-Wasm build (1.32.0) doesn't include the
`parquet` extension. `COPY … (FORMAT PARQUET)` crashed Node's bindings, and in
a browser it would try to download the extension from `extensions.duckdb.org`:
a new third-party request that might not load under our `require-corp`
header. Arrow is what `insertArrowTable` already uses.

**Import** (`src/parser/import-snapshot.ts`, in the parser Worker) mirrors
`loadSave`:
1. download (`src/parser/download-share.ts`)
2. decode the container strictly
3. check every table and column against the current schema; anything unknown
   is refused as "made with a different version" (constitution III)
4. insert each stream with `insertArrowIPC` (db.ts), one record batch at a
   time: scratch table, then `INSERT INTO t BY NAME`. So an older snapshot
   still imports after an additive schema change, with missing columns taking
   their default or NULL.
5. finish with the usual `ready` message

Everything downstream (tabs, map, keep) is unchanged. `db.ts`'s Arrow test
seam now also carries `tableFromIPC` and `Table`.

**Backend: same-origin Pages Functions** (`functions/api/shares/`), deployed
with the site. The deploy job checks out `functions/` and `wrangler.toml`
next to the tested `dist/`.
- `POST` streams the upload straight into R2 without reading it (the free
  plan allows 10ms of CPU per request).
- `GET` returns the stored bytes with `Content-Encoding: br` and
  `encodeBody: "manual"`, so the viewer's browser decompresses natively and
  viewers need no WASM.
- `DELETE` needs the delete key. Only its SHA-256 is stored.

Limits:
- 40MiB per upload
- 5 shares per hour per visitor, tracked in KV with a salted, truncated IP
  hash that expires after an hour
- a 1.3GB daily byte budget, which with 7-day retention stays under R2's free
  10GB

Links:
- A link expires exactly at 7 days: the Function checks the object's
  `createdAt`. An R2 lifecycle rule deletes the data within 24 hours after.
- The 6-byte timestamp in each ID keeps "expired" distinguishable from "not
  found" after deletion. Early deletes leave a tombstone object, so the link
  reads "taken down".
- Preview deployments use separate buckets and KV (`[env.preview]` in
  `wrangler.toml`).

**UI**:
- a Share button (hidden for a shared game) opens `ShareDialog`:
  confirm → preparing → compressing → uploading → link
- `/s/<id>` makes `FileLoader` import the share instead of offering the kept
  save, and labels the session "Shared game · expires …"
- links that can't be opened get `SharedLinkMessage`, with one distinct
  message per failure
- the sharer's delete keys live in `localStorage` (`src/share/shareLinks.ts`)


## Country Factbook Tabs (018): a nine-tab country dossier, built and checked one tab at a time (2026-09-26)

Factbook → Countries went from two working tabs (a six-stat Overview and a
name/development Provinces list) to nine: Overview, History, Provinces,
Locations, Military, Government, Estates, Values, Subjects. Trade is gone,
Diplomacy became Subjects, and Economy, Building Registry and Characters
show the Coming Soon page. Details: `specs/018-country-factbook-tabs/`.
Every tab was checked by the owner against the real Russia save before the
next was started.

**Three new save sections, found by grepping the real save** (never the
fixture, per the 011 rule):
- `loan_manager` → `loans`. `borrower` is a country idx; government bonds
  (`bond=yes`) count as debt. Total debt is a query-time sum.
- `estate_manager` → `nation_estates`. It holds a record per estate type for
  every country; only `existence=yes` ones are real. The crown record has
  satisfaction only, so its economic columns stay NULL ("Not tracked").
- `diplomacy_manager.dependency` → `subject_relations`
  (`first` = overlord, `second` = subject, type in the `subject_type` named
  target). This **overturned 014's "subject relations aren't in the save"**:
  that spike only looked for overlord keys on the country record. 195
  relations in the reference save, 6 of them nested. Kept out of
  `diplomatic_relations` so 013's chord chart is unchanged.
- Plus three `nations` columns: `government_power` (legitimacy, republican
  tradition, devotion, horde unity or tribal cohesion, labeled by
  government type), `prestige`, and `monthly_income` (`economy.income`, the
  owner's "wealth"; no wealth field exists).

A malformed loan or dependency is skipped and reported as a new
`skipped-entries` load warning, not dropped silently. The shared fixture
stays well-formed; the tests inject malformed entries themselves.

**Old kept saves and old share links** get the new tables empty. Each new
section checks `EXISTS (SELECT 1 FROM <table>)` (014's pattern) and says
"Not in this save's data — reload the save file" instead of a zero.
`tests/share/pre-018-snapshot.test.ts` forges a pre-018 share link to prove it.

**Game-file data, generated once** (`tools/country-names/generate.ts`,
`npm run generate:country-names -- --install <game>`):
- `countryNames.json` (86KB): law, policy, privilege, estate, pop type and
  subject type names, and each government type's power label. Policy names
  aren't in the 008 encyclopedia data; they come from
  `laws_and_policies_l_english.yml`. `$key$` references and script calls
  like `[GetCharacter('x')...]` are resolved or made readable.
- `countryModifiers.json` (160KB, loaded only when Government opens, so it's
  its own build chunk): each policy's and privilege's `country_modifier`,
  named constants resolved from `script_values` (e.g.
  `small_privilege_target_satisfaction = 0.025`), `*_tt` tooltip keys
  resolved to text, and each modifier type's name
  (`MODIFIER_TYPE_NAME_<key>`) and format (`percent`, `already_percent`,
  `boolean`, `decimals`, `color`). `in_game/common/script_values/eu4_conversions.txt`
  doesn't parse and is skipped with a warning.

Effects are colored the game's way: a modifier with no color setting is
better when higher, `color=bad` better when lower (so +100% Nobles Power is
red), `color=neutral` never colored. Sign plus screen-reader "helps/hurts"
text back up the color.

**Reuse over rebuild:**
- Overview literacy and pies use the same pop set as 014's Country Literacy
  map mode (pops in the nation's own locations).
- Provinces and Locations share the map's SQL: `POP_TOTALS_CTE` and
  `PROVINCE_TOTALS_CTE` are now constants used by `listMapLocationsArrow`
  too, so a table can't disagree with the map. Both tables build Perspective
  from an explicit schema (`usePerspectiveRows`), so an all-empty column for
  a small nation still gets the right type.
- History reuses `LeaderboardChart`; `RulerHistoryChart` gained an optional
  controlled `selectedIdxs`.
- Military: Firepower's per-nation assembly moved into `firepowerData.ts`
  (`loadArmyProfiles`, `loadNavyProfiles`, `buildDoctrinePoints`), shared by
  Firepower and the new tab. Firepower had no tests of its own;
  `firepowerProfiles.test.ts` now covers the shared code.

**Owner-driven changes during the build:**
- Estate and social-class pies use the game's named colors (`02_map.txt`
  `pop_*`/`estate_*`) and list every group; religion and culture fold
  slices under 2% into "Other".
- Military's doctrine chart is 16rem tall there only (scoped CSS);
  Firepower keeps its size.
- Government: Policies and Estate Privileges sub-tabs, each a table with a
  Modifiers column; privileges are grouped into one row group per estate.
  The earlier hover tooltip and pinned Effects panel are kept behind
  `interactiveEffects` (default off). `HoverTooltip` now accepts markup.
- Every Countries tab uses the full content width
  (`FULL_WIDTH_COUNTRY_TABS` in FileLoader).
- Subjects is a nested list of buttons, not an ARIA tree (a real tree needs
  arrow-key handling).

**Dropped: a Cabinet tab.** The owner asked for time spent per cabinet
action. `cabinet_manager` only holds each country's current actions (one
entry per slot, at most 9 per country) with their start dates; there's no
history anywhere in the save.

**Known limit: the real save can't be parsed in Node tests.** Running
`parseAndStore` on the 642MB save under the Node DuckDB-Wasm bindings fails
inside DuckDB ("Invalid bitmask for FixedSizeAllocator") on a
`nation_history` insert, a table 018 doesn't touch. Real-save checks were
done in the browser by the owner, plus direct greps of the save.

## Battle Simulator (019): a save-independent engine, a generated rules table, and an uncertainty ledger (2026-09-26)

A new top-level **Battle Simulator** section plays out one EU5 land battle
hour by hour between two sides. Each side is pre-filled from a real army in
the loaded save or entered by hand (it works with no save at all). Every
input is editable and shows its source (`save` / `default` / `edited`).

**Engine/worker split**:
- `src/battleSim/` is a pure module with no React, no DuckDB,
  `Math.random` or `Date`: `engine.ts`, `combatFormula.ts`, `frontage.ts`,
  `validation.ts`, and a seeded sfc32 `rng.ts`.
- It runs in `battleSim.worker.ts` (the same pattern as
  `share/compress.worker.ts`). The UI sends a fully resolved `BattleInput`,
  and stale runs are dropped by `runId`.
- It's deterministic per seed, so every result can be replayed exactly
  (**Replay seed**), and the tests don't flake.
- It's fast: about 30 ms for 100 regiments per side and about 45 ms for 300.

**No combat numbers in engine code.**
- Every constant comes from `combatRulesReference.ts`. It is generated by
  `tools/battle-sim-reference/generate.ts` from the game's own `NCombat` /
  `NUnit` defines, the topography/vegetation/location-rank files, the
  army formation preferences, and the general traits.
- Per-unit stats reuse 012's `UNIT_TYPE_REFERENCE`.
- The few constants the files don't provide (the ×2 dice slope, the
  experience scale, the 2,400-hour cap) live in `assumedConstants.ts`, each
  tagged with a ledger ID.
- A test fails if a numeric literal other than 0 or 1 appears in
  `engine.ts` or `combatFormula.ts`.
- Gotcha: `static_modifiers/location.txt` sets `local_frontage_allowed` in
  more than one block. The base is only `location_base_values` (10), not the
  last match (3).

**The uncertainty ledger**
(`specs/019-battle-simulator/combat-unknowns.md`) is the source of truth
for every combat rule we aren't sure about, one fact per `U-xx` ID, with a
status.
- Code cites `// ASSUMPTION U-xx`, and each result lists the IDs that
  affected it in an Approximations panel.
- `src/battleSim/unknowns.ts` is generated from the ledger, and a test keeps
  the two in sync.
- New uncertainties get a ledger entry *before* code.

**New save data**:
- `regiments` gains `unit_idx`, `box`, and `experience`. Only the regiments
  `insertRows` call was updated, per the full-column rule.
- New `armies` table (`unit_manager` stacks with `is_army=yes`) and new
  `generals` table (leader characters' `mil` and `general_trait`).
- Real-save findings:
  - `box` is `Left`/`Right`/`Reserves`/`Captured` or absent. It's never
    `Center`, so absent is read as center.
  - A regiment's `strength` is in thousands, the same scale as the unit type's
    `max_strength`: 81% of regiments are within 10% of max.
  - `number` is an integer ordinal, not a headcount. **012's
    `listRegimentSummaryArrow` sums `number` as `total_number`**, which Army
    Stats shows as headcount and levy/regular totals and Navy Stats uses as
    ship counts. That's flagged, not fixed here.
  - Unknown `box` values surface as a new `unrecognized-values` load warning.

**Calibration** (`tools/battle-sim-reference/extract-reference-battles.ts`
+ `calibrate.ts`) replays the 36 land battles the real save records under
`war_manager.database[*].battle`:
- It picks the recorded winner **88%** of the time.
- Casualties come out **10–17× too low**.
- Recorded losers are often wiped out at modest odds, or lose exactly 40% at
  overwhelming odds.

Those findings updated the ledger (U-32 marked `wrong`, new U-48 and U-49).
Nothing was tuned to fit the data.

### Same day: Firepower → Battle Simulator handoff (019 User Story 4)

Firepower's Army Stats view has a **Simulate a battle** bar
(`SimulateMatchupBar.tsx`) once two or more countries are selected: choose
attacker and defender among them, swap if needed, then **Open in Battle
Simulator →**.

`FileLoader` passes the choice as a one-shot request
`{ id, attackerIdx, defenderIdx }`. The simulator applies each `id` once,
pre-filling both sides from each nation's largest army with the same code
its own nation picker uses.

The Battle Simulator now stays mounted (hidden) after its first visit
rather than unmounting on every section switch. That keeps its sides,
conditions, last result, and worker, so moving between Firepower and the
simulator keeps the setup. It's lazily mounted, so a session that never
opens it pays nothing.

### Same day: a running scoreboard across runs (019 FR-017)

`BattleScoreboard.tsx` tallies every finished run of the current matchup,
with a victories donut, a casualties donut, and a numbers table.

- **Tally identity** is `hashBattleInput` (every input except the seed).
  Changing anything restarts the tally with a visible note, so runs of
  different setups are never mixed (Constitution IV).
- A replayed seed produces the identical battle, so it isn't counted
  again.
- The chart colors (Okabe-Ito blue/orange/reddish purple) were run
  through the dataviz skill's palette validator against this app's
  light-only surface. Gray failed the chroma floor for "no winner", so
  reddish purple replaced it.
- The orange/purple contrast warning is covered by direct slice labels
  and the table.
