# Phase 0 Research: Save Format Support

Every finding below was confirmed by running code against the real saves on
this machine during planning (2026-09-24), not taken from documentation. The
spike code lives in the session scratchpad and is not committed. The
decisions are what carry forward.

Real inputs used:
- `~/Documents/Paradox Interactive/Europa Universalis V/save games/MP_RUS_1628_08_14_7a5f6d56-dd37-4edb-aa18-f35de833364a.eu5`
  (84,045,806 bytes, header `SAV02039ce65dcc0006314700000000`)
- `~/Downloads/Russia (Melted).eu5` (642MB, `SAV0200…`, the save every
  feature to date has been verified against)
- `rakaly melt` 0.8.19 (`/opt/homebrew/bin/rakaly`) as the reference melter

## R1. Save header format codes

**Decision**: Route on the two hex digits at bytes 5–7 of the `SAV` header,
using jomini's envelope definitions. There are six codes, not the four the
spec assumed:

| Code | jomini name | Meaning | Route |
|---|---|---|---|
| `00` | Text | uncompressed text | existing fast path, no melter |
| `01` | Binary | uncompressed binary | melter |
| `02` | UnifiedText | text metadata + zip with text gamestate | melter (unzip only, copies text through) |
| `03` | UnifiedBinary | binary metadata + zip with binary gamestate | melter |
| `04` | SplitText | metadata stored inside the zip, text | melter |
| `05` | SplitBinary | metadata stored inside the zip, binary | melter |
| other | Other(n) | unknown | `unrecognized-format` error |

**Rationale**: Source is
`rakaly/jomini/crates/jomini/src/envelope/header.rs` (`SaveHeaderKind`).
That file points to pdx_unlimiter's `ModernHeader.java` for the same field
layout. `00` and `03` are confirmed on real files. The others come from the
shared Jomini-engine envelope that jomini handles for every modern PDS
title. The header is `SAV` + 2-hex version + 2-hex kind + 8 random bytes +
8-hex metadata length (+ optional 8 padding) + `\n`.

**Alternatives considered**: Detecting zip by scanning for `PK\x03\x04`.
Rejected because it's heuristic, and the header states the format outright.

## R2. Binary decoding library & licensing

**Decision**: Build a small Rust→WASM crate, `eu5-melter`, that depends on
rakaly/jomini's `eu5save` crate (MIT), pinned by git commit, and exposes a
`melt` function. Do **not** use pdx-tools code or its compiled
`wasm_eu5_bg.wasm`.

**Rationale**:
- pdx-tools (`github.com/pdx-tools/pdx-tools`) is **AGPL-3.0**. Shipping its
  compiled module in a web app would require publishing NauticalBeg's source
  under AGPL.
- rakaly/jomini (`github.com/rakaly/jomini`, workspace `license = "MIT"`)
  contains `eu5save`, which already implements the whole envelope (all six
  header kinds, zip extraction, the per-save `string_lookup` table via
  `SaveResolver`) and a binary→text melter (`Eu5Melt`, `MeltOptions`,
  `FailedResolveStrategy`) that tracks unknown tokens and lookups.
- `eu5save` is `publish = false`, not on crates.io, so it's taken as a git
  dependency pinned to a commit. Commit `4461f6e41b28cf7888e2a849858029f9fe4b5a52`
  (2026-09-22) was used in the spike. `jomini` itself is patched to the same
  checkout via `[patch.crates-io]`, mirroring the workspace's own setup.
- The npm `jomini` package already in the app is text-only (it exposes only
  `parseText`), so it cannot do this itself.

**Alternatives considered**:
- A pdx-tools WASM module was rejected: AGPL.
- A binary-native adapter, parsing binary directly into the DB without
  melting, was rejected: it would mean a second parser to keep in step with
  `1.3.11.ts` (Principle VII), and downstream output could drift from text
  saves (breaks FR-004).
- Shelling out to rakaly was rejected: the app is browser-only (Principle I).

## R3. Token table source, format, and ID mapping

**Decision**: Ship pdx.tools' EU5 token file, used with permission granted
2026-09-24, decompressed into its raw "flat" form, with a hand-written
reader in our crate. We don't use pdx-tools' AGPL `FlatResolver`.

**Findings**:
- The file is served at `https://pdx.tools/assets/eu5-C4s2dwpt.bin`
  (84,846 bytes, zstd, sha256
  `3630ea26ed3713051f0ab97076239f40d761feef84248bb421d17bb6fa3f2615`). It is
  loaded at runtime through `set_tokens()` in their worker and is not
  compiled into their WASM.
- Decompressed, it is 330,818 bytes (sha256
  `d2c200efefd980e33b99e371d615046c914b7bb5deea053b69e22091051cc3d5`).
- Layout, reverse-engineered from the bytes:
  `u16le A (=23701) | u16le B (=9999) | then entries, each u8 len + len bytes UTF-8`.
  There are 23,700 entries (16,095 non-empty); an empty entry means no token.
- **ID mapping**: `token_id ≤ B → entries[token_id]`,
  `token_id > B → entries[token_id - 1]`. The ID `B` = 9999 is not part of
  the table. This was **found by getting it wrong first**: plain
  `entries[id]` melted with 17 unknown tokens and silently shifted every
  high-range key by one slot (e.g. `player_country_name` came out as
  `shown_in_loading_screen`). The corrected mapping gives **0 unknown
  tokens** on the real save. Tests must lock this mapping in (see R7).

**Rationale for shipping decompressed**: 330KB raw, and our static host
compresses it in transit anyway. Shipping raw avoids pulling a zstd decoder
into the WASM. The original `.bin` hash is recorded for provenance.

## R4. Token-table version drift: `strength` vs `unused_strength`

**Finding**: Diffing our melt against rakaly's melt of the same save across
all 40,220,828 lines found exactly **one** key-name disagreement:
token `0x28de` (10462) is named `unused_strength` in pdx.tools' table and
`strength` in rakaly's, 4,637 times, all in `subunit_manager.database.*`.
Our adapter reads `subunit.strength` (`1.3.11.ts:746`, the Firepower tab's
regiment strength). pdx.tools' table was evidently generated from a later
game version where that field was renamed. For a 1.3.11 save, `strength`
is correct.

**Decision**: Keep a small **per-game-version token override map** next to
the token table (`{ "1.3.11": { 0x28de: "strength" } }`), applied on top of
the flat table before melting. The version is read from the save's metadata
first (see R6), so the override is selected by the same explicit version
routing Principle III requires.

**Consequence for future versions**: Adding a new supported game version
must include re-running the rakaly cross-check (quickstart §4) against a
real save of that version to find any new overrides.

## R5. Melt output fidelity vs rakaly

**Finding**: After R3 and R4, our output against rakaly 0.8.19 on the
real save:
- Same line count (40,220,828) and about the same size (653,791,300 vs
  653,667,537 bytes).
- The remaining differences are **quoting style only**
  (`tag="location"` vs `tag=location`, `original_tag="PIR"` vs
  `original_tag=PIR`). These are equivalent to the text parser: both parse
  to the same string value.
- **One real upstream bug**: 138 `Custom_Name=` values that come from the
  string lookup table and contain spaces are written **unquoted**
  (`Custom_Name=Lil Israel`). jomini-JS tolerates this without throwing,
  but reads `Custom_Name` as `"Lil"` and leaves a stray `Israel` token.
  Rakaly writes `"Custom_Name"="Lil Israel"`.

**Decision**: Carry a minimal patch in our crate's melt call so that a
lookup-table string written in value position is quoted when it contains
whitespace or any of `={}"#`. Implement it as a small vendored patch to
`eu5save/src/melt.rs`, applied by the build script, and file it upstream
with rakaly/jomini. Nothing reads `Custom_Name` today, but Principle IV
means we don't knowingly produce corrupted values.

**Verification**: Both our melt and rakaly's parse successfully with the
app's jomini-JS `parseText({typeNarrowing:"unquoted"})` and return
identical `metadata.date` / `player_country_name` / `version`.

## R6. Where version detection happens for binary saves

**Decision**: Melt first, then run the existing `detectVersion` and adapter
on the melted text, unchanged. Choose the token override set by reading
`metadata.version` from the melted **metadata** section, which the melter
emits first, before the gamestate. In practice the melter API takes the
override set as an argument, and `load-save.ts` does a cheap metadata-only
melt to learn the version before the full melt.

**Rationale**: Keeps a single version-detection path (Principle III). A
metadata-only melt of the ~405KB prefix is negligible compared with the
310MB gamestate.

**Alternative**: Always apply the 1.3.11 overrides. Rejected: it would
silently mis-name fields for a future version, which is exactly the
failure Principle III forbids.

## R7. Test fixtures (Principle II)

**Decision**: Add a test-only **encoder** in the Rust crate that turns a
text document into EU5 binary tokens, and use it to generate committed
fixtures from the existing `tests/fixtures/rus-1628-minimal.eu5`. It covers
keys via reverse token lookup, `=`, `{`, `}`, quoted/unquoted strings, I32,
FIXED5 decimals, bool and dates.
- `rus-1628-minimal.bin.eu5`: header code `01`, uncompressed binary
- `rus-1628-minimal.zip.eu5`: header code `03`, zipped binary + `string_lookup`
- `rus-1628-minimal.ztext.eu5`: header code `02`, zipped text

Regression tests assert that each variant, run through the full `loadSave`
pipeline, produces the **same stored rows** as the text fixture.
Separately, Rust unit tests pin the R3 ID mapping (IDs 9998, 10000 and
0x28de) and the R5 quoting patch.

**Rationale**:
- The real 84MB save can't be committed: it's too large, and it's 274
  players' multiplayer data.
- EU5's binary number encoding (FIXED5_* variants, LOOKUP_* variants, see
  `jomini/src/binary/lexer.rs`) is too intricate to hand-write bytes for.
- An encoder built from jomini's own lexeme constants makes fixtures
  reproducible and diffable (`npm run generate:save-fixtures`).
- The real-save equivalence check (SC-002) stays a documented manual/local
  step (quickstart §3/§4), in keeping with how every prior feature has
  verified against the real save.

## R8. Performance & memory

**Measured** (Apple Silicon, same machine):

| Path | Time | Peak memory |
|---|---|---|
| Native Rust melt of real save | 4.0s | 117MB RSS |
| WASM melt in Node, single returned `Vec<u8>` | 5.6s | 1.52GB RSS |
| jomini-JS `parseText` of 654MB melted output | 1.5–2.3s | n/a |

The 1.52GB WASM figure has two causes. Linear memory holds input + zip
buffers + a 654MB output `Vec` + growth slack, and then the result is
**copied** into a JS `Uint8Array`, which adds another 654MB. WASM linear
memory never shrinks while the instance lives.

**Decision**:
1. **Stream the melt output to JS in chunks** (e.g. 8MB) through a JS writer
   callback. The melter writes into a JS-owned `Uint8Array` pre-sized from a
   size estimate, growing by doubling if needed. The WASM heap then holds
   only input + decompression state (~150MB), not the output.
2. **Instantiate the melter WASM per load and drop it afterwards**, so its
   linear memory is garbage-collected before DuckDB ingestion starts.
3. **Transfer the `File` bytes rather than duplicating them**: the existing
   `readFileAsBytes` result is passed straight in. The 84MB input is small
   next to the output.
4. Progress: the writer callback reports output bytes against the estimate
   (see data-model Load Stage). Melting a 310MB gamestate takes about 5s,
   so progress updates are required (Principle V).

Expected peak ≈ today's melted-text load (654MB output buffer + jomini
parse) + ~150MB, inside SC-003's 1.5× budget. The quickstart measures
this for real.

**Measured in browser (2026-09-25, T023)** on the real 84MB
`MP_RUS_1628` save, dev server, Chrome automation tab:

| | Compressed binary | Melted text |
|---|---|---|
| melt | 23.4s | n/a |
| total to Overview | 139.2s | 112.3s |

The ratio is **1.24×** (SC-003 ✅), and the Overview figures are identical
(SC-002 ✅). The same WASM melt takes 6.0s in Node, including with
`--liftoff --no-wasm-tier-up`, and 17.6s in a bare page in the same
automation-attached Chrome. So the in-browser melt time is inflated by the
instrumented session and still needs timing in an ordinary Chrome window.
Peak tab memory wasn't measured: the automation session can't read Chrome
Task Manager.

**As built, point 2 changed:** wasm-bindgen's glue keeps one module
instance per JS realm, so "instantiate per load" isn't possible through
`initSync`. The glue is built with `--experimental-reset-state-function`
instead, and `melt.ts` calls `__wbg_reset_state()` after every melt, which
has the same effect: fresh linear memory, and the old memory becomes
garbage.

**Cancellation (found in browser):** because the melt is synchronous, a
cancel sent during it only takes effect once it returns (~20s in the
instrumented browser). A superseded load also used to continue into
parsing, overwrite the newer load's UI and leak its OPFS database. That is
fixed in `load-save.ts` (see ARCHITECTURE.md, "Save Format Support").

## R9. Toolchain & build integration

**Findings**: Homebrew `rustc` 1.98.1 comes first on PATH and has **no**
wasm32 target. The rustup-managed `stable` 1.94.1 in `~/.cargo/bin` does,
after `rustup target add wasm32-unknown-unknown` (done during planning).
`wasm-bindgen-cli` 0.2.128 is installed to match the lockfile's
`wasm-bindgen`.

**Decision**:
- The crate lives at `tools/eu5-melter/` and builds with
  `npm run build:melter`. That script runs cargo with `~/.cargo/bin` first
  on PATH, then `wasm-bindgen --target web`, and writes into
  `src/parser/melter/generated/`.
- **The generated `.wasm` + JS glue are committed**, like the committed
  map/encyclopedia outputs, so `npm run dev`/`build`/`test` never need a
  Rust toolchain. Only changing the melter does.
- The release profile uses `lto = true`, `codegen-units = 1` and
  `opt-level = 3`. The spike WASM was **238KB**.
- For vitest (Node), wasm-bindgen's `--target web` glue accepts explicit
  bytes through `initSync({ module })`, so tests load the `.wasm` with
  `fs.readFileSync`. The worker uses Vite's `?url` import.

## R10. Error mapping

| Condition | Source | New `ErrorKind` |
|---|---|---|
| Header not `SAV…` | `looksLikeSaveFile` | `not-a-save` (unchanged) |
| Header kind not 0–5 | header parse | `unrecognized-format` (**new**) |
| Header malformed, truncated file, bad zip, missing `gamestate` entry, binary stream ends mid-token | envelope / melt errors | `damaged-save` (**new**) |
| Token table asset fails to fetch or load | melter init | `binary-unavailable` (**new**) |
| Version not in `ADAPTERS` | `detectVersion` | `unsupported-version` (unchanged) |
| Anything else after melt | adapter | `parse-failed` (unchanged) |
| Unknown tokens/lookups > 0 | `MeltedDocument` | **not an error**: `ready` carries `warnings` |
| Header declares a zip (kinds 2–5) but none is found | `lib.rs` `open()` | `damaged-save` (added in implementation: jomini otherwise falls back to "uncompressed" and melts a truncated zip into garbage) |

A WASM panic surfaces in JS as a thrown `RuntimeError`. It's caught in
`load-save.ts` and mapped to `damaged-save`, never an uncaught tab crash
(security constitution: a malformed file must not crash the tab). The
melter enforces a **decompressed-size cap** of 2GB on `gamestate`, so a
crafted zip bomb produces `damaged-save` rather than exhausting memory.
