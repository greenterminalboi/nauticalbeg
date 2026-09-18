# Phase 0 Research: Save Import & Overview

## 1. EU5 save file format

**Decision**: Treat the exact byte-level format as unknown until real
sample saves are inspected, but design the parser around the precedent set
by other Clausewitz-engine titles (EU4, CK3, Stellaris): a save is
typically a zip-style archive containing key-value "Clausewitz syntax"
text, with an optional binary-encoded ("ironman") variant that uses a
token/id table instead of raw text tokens. Build `version-detect.ts` and
the first `version-adapters/` entry against real exported saves as the
first task in implementation, before any other parser work, per
constitution Principle II (fixtures before logic).

**Rationale**: No public EU5 save-format specification is assumed to exist
(it's an undocumented, reverse-engineered format per the constitution).
Precedent from sibling Clausewitz titles is the best available starting
hypothesis, but it must be validated — not assumed correct — against real
files.

**Alternatives considered**: Waiting for a community-documented format
before starting. Rejected — would block all progress on this feature
indefinitely; instead the first implementation task is exploratory format
analysis against real sample saves, captured as the first fixtures.

## 2. Client-side structured storage engine

**Decision**: `wa-sqlite` (SQLite compiled to WebAssembly) using its OPFS
(Origin Private File System) VFS for both session-only and "kept"
databases.

**Rationale**:
- Handles the 500-600MB scale without materializing the whole save as a
  single in-memory JS object graph — OPFS-backed SQLite pages data to
  disk-backed storage rather than requiring it all live in the JS heap.
- Gives a real SQL query interface, which is exactly the shape of interface
  the future AI copilot (constitution Principle VIII) needs to expose safe,
  parameterized, read-only "tools" over the save data.
- Works entirely client-side with no server component, consistent with
  constitution Principle I.

**Alternatives considered**:
- `sql.js` (SQLite compiled to WASM, in-memory only, no OPFS): simpler to
  set up, but requires the entire database to fit in JS heap memory —
  risky at 500-600MB, especially on memory-constrained devices/mobile
  browsers.
- Plain IndexedDB with hand-rolled object stores: natively supported, no
  WASM dependency, but has no query language — every "query" the AI agent
  or a future visualization needs would require custom application code
  instead of a parameterized SQL statement, and range/aggregate queries
  (e.g., "top 10 provinces by development") are far more natural in SQL.
- Server-side storage/database: rejected outright — conflicts with
  constitution Principle I's preference for client-side processing and
  minimal retention.

**Known risk**: OPFS + WASM SQLite browser support is strong in current
Chrome/Edge/Firefox but has had a more limited/newer rollout in Safari.
Track actual supported-browser matrix as a task; if Safari support proves
inadequate, the fallback is restricting the "kept save" feature (User Story
4) to browsers with OPFS support and clearly messaging the limitation,
without changing the storage engine for supported browsers.

## 3. Parsing execution model

**Decision**: Run parsing inside a Web Worker, reading the file
incrementally via `File.slice()`/`ReadableStream` rather than loading the
full file into memory at once, and inserting parsed rows into the SQLite
database incrementally as parsing progresses. The worker posts progress
messages back to the main thread.

**Rationale**: Satisfies constitution Principle V (must not block the main
thread, must show progress for operations over ~1s) and avoids a second
large in-memory copy of the save on top of whatever the database layer
holds.

**Alternatives considered**: Parsing synchronously on the main thread —
rejected, would freeze the UI for the full parse duration on a 500-600MB
file, far exceeding the 1-second progress-feedback threshold. Parsing via a
separate backend service — rejected per Principle I (client-side
preference) and Assumptions (no server dependency for this feature).

**Update (post-implementation)**: The actual tokenizer/parser is
[`jomini`](https://www.npmjs.com/package/jomini) (MIT, WASM), not a
hand-rolled one as originally implied here — discovered mid-implementation
via a comparison against an existing open-source Paradox save-parsing
toolkit (see `research-save-format.md`'s "Save format parsing" note and
`ARCHITECTURE.md`). It's also why the file is read as raw bytes
(`Uint8Array`) rather than decoded text: `jomini` parses bytes directly,
and decoding a 653MB file to one JS string hits V8's string-length ceiling
in Node (confirmed directly), which bytes avoid. The Web Worker /
incremental-file-read /progress-messaging decision above is unaffected —
this update only changes what does the actual tokenizing once the bytes
are in hand.

## 4. UI framework and tooling

**Decision**: React 18 + TypeScript, built with Vite.

**Rationale**: Mainstream, well-supported for the kind of component-driven,
data-heavy UI this product will grow into (overview now, maps/time-series/
comparisons later), and has the broadest ecosystem of visualization
libraries to draw on for future features. Vite gives fast local iteration
and a standard, low-maintenance build setup.

**Alternatives considered**: Svelte/SvelteKit (lighter runtime, smaller
ecosystem for complex data-viz) and Vue (comparable to React, smaller
visualization-library ecosystem). Neither offered a strong enough
advantage over React to justify diverging from the mainstream choice for a
project that will lean heavily on the visualization ecosystem later. This
is a lower-stakes decision than the storage engine and can be revisited if
it becomes a real constraint.

## 5. Testing strategy

**Decision**: Vitest for unit/integration tests (parser fixtures, storage
layer, aggregation logic), React Testing Library for overview-component
tests. No end-to-end browser test runner (e.g., Playwright) for this
feature.

**Rationale**: Vitest integrates directly with the Vite build already
chosen, keeping tooling minimal (Principle VII). The parser and storage
layers are the highest-risk, highest-value areas to test given
undocumented save formats and large-data handling; component-level testing
covers the overview UI's rendering logic. A full browser e2e suite adds
setup cost without validating anything the unit/integration tests plus
manual `quickstart.md` verification don't already cover for this feature's
scope.

**Alternatives considered**: Playwright e2e from the start — deferred, not
rejected; revisit once there's a real multi-page flow (post-MVP) worth
testing end-to-end.
