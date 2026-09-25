---

description: "Task list for Save Format Support (Compressed & Ironman Saves)"
---

# Tasks: Save Format Support (Compressed & Ironman Saves)

**Input**: Design documents from `/specs/015-save-format-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/melter-wasm.md, contracts/worker-protocol-delta.md, quickstart.md

**Implementation notes (2026-09-25)**: the format-equivalence, error-path and cancel tests for T019/T024/T026/T029 live in `tests/parser/load-save-formats.test.ts`, not `load-save.test.ts`, to keep that file's single-fixture setup separate. The T009 patch lives in the vendored copy (`tools/eu5-melter/vendor/eu5save/`). Implementation also added: text-zip handling without `string_lookup`, a "declared zip but none found" → damaged check, `__wbg_reset_state` in place of per-load instances, the cancel-during-melt fix in `load-save.ts`, `LoadWarningNotice.tsx` plus its test, and the duckdb-test-env temp-folder leak fix.

**Tests**: Included because spec FR-013 and Constitution Principle II (NON-NEGOTIABLE) require a committed fixture + regression test for every supported format, and research R3/R5 require unit tests pinning the token-ID mapping and the quoting patch. No other TDD scaffolding is added.

**Organization**: Grouped by user story from spec.md:
- US1 (P1): load the compressed binary save the game wrote
- US3 (P1): existing text saves unchanged
- US2 (P2): compressed text
- US4 (P2): clear error messages

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 per spec.md

## Path Conventions

This is a single client-only project. New Rust crate: `tools/eu5-melter/`. App code: `src/parser/`, `src/components/Overview/`. Tests: `tests/`. Real-save paths for manual checks are in quickstart.md.

Shell note for every Rust task: Homebrew's `rustc` comes first on PATH and has **no** wasm32 target. Run cargo with `PATH="$HOME/.cargo/bin:$PATH"` (research R9).

---

## Phase 1: Setup

**Purpose**: The melter crate, token asset and build script that everything else depends on.

- [X] T001 Create `tools/eu5-melter/Cargo.toml`:
  - package `eu5_melter`, edition 2024, `license = "MIT"`, `crate-type = ["cdylib", "rlib"]`
  - dependencies `eu5save` and `jomini` (with `features = ["envelope"]`) as git deps on `https://github.com/rakaly/jomini` pinned to `rev = "4461f6e41b28cf7888e2a849858029f9fe4b5a52"`
  - `wasm-bindgen = "=0.2.128"`
  - `[patch.crates-io] jomini = { git = …, rev = same }`
  - a feature `encoder` (off by default)
  - `[profile.release] opt-level = 3, lto = true, codegen-units = 1`
  - Add `tools/eu5-melter/target/` to `.gitignore`.
- [X] T002 [P] Add the token asset `public/tokens/eu5.flat`: download `https://pdx.tools/assets/eu5-C4s2dwpt.bin`, zstd-decompress it, and verify both hashes (original `.bin` sha256 `3630ea26ed3713051f0ab97076239f40d761feef84248bb421d17bb6fa3f2615`, decompressed sha256 `d2c200efefd980e33b99e371d615046c914b7bb5deea053b69e22091051cc3d5`, 330,818 bytes).
- [X] T003 [P] Write `public/tokens/README.md`. It records:
  - the source URL and both sha256s from T002, and the fetch date 2026-09-24
  - that the table is used **with permission from pdx.tools, granted to the project owner 2026-09-24**
  - that pdx-tools code (AGPL-3.0) is deliberately not used; only this data file is
  - the flat layout and ID rule from data-model.md ("`id ≤ breakpoint → entries[id]`; `id > breakpoint → entries[id - 1]`")
  - a pointer to `src/parser/melter/token-overrides.ts`
- [X] T004 Write `tools/eu5-melter/build.sh`. It sets `PATH="$HOME/.cargo/bin:$PATH"`, runs `cargo build --release --target wasm32-unknown-unknown`, runs `wasm-bindgen --target web --out-dir ../../src/parser/melter/generated --out-name eu5_melter`, and fails loudly if either tool is missing (quickstart prerequisites). Add npm scripts to `package.json`: `"build:melter": "bash tools/eu5-melter/build.sh"` and `"generate:save-fixtures": "cargo run --manifest-path tools/eu5-melter/Cargo.toml --features encoder --bin make-fixtures"`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Format detection, the melter (Rust + TS wrapper), the protocol additions and the generated fixtures. US1–US4 all build on these.

### Tests first (Principle II)

- [X] T005 [P] Rust unit tests in `tools/eu5-melter/src/tokens.rs` (`#[cfg(test)]`), loading `public/tokens/eu5.flat`. They assert:
  - resolve(1717) == "date"
  - resolve(2526) == "metadata"
  - resolve(15285) == "player_country_name" (above-breakpoint, the bug found in R3)
  - resolve(13431) == "code_version_info"
  - resolve(9999) is None
  - resolve(0x28de) == "unused_strength" without overrides and "strength" with the 1.3.11 override
  - a table shorter than 4 bytes, or with an entry running past EOF, is rejected
- [X] T006 [P] Rust unit test in `tools/eu5-melter/src/lib.rs` (`#[cfg(test)]`) for the R5 quoting patch. Using a lookup-only resolver (like upstream `melt.rs` tests' `LookupResolver`), a binary body `Custom_Name = <lookup "Lil Israel">` must melt to a line containing `Custom_Name="Lil Israel"`, while a lookup value `location` stays `=location`.
- [X] T007 [P] Create `tests/parser/save-format.test.ts`:
  - `parseSaveHeader` on the real header strings `SAV02009ce65dcc0004e3d100000000\n` gives `{ headerVersion: 2, kindCode: 0, encoding: "text", container: "plain" }`
  - `SAV02039ce65dcc0006314700000000\n` gives `{ kindCode: 3, encoding: "binary", container: "unified-zip" }`
  - kinds 1/2/4/5 map per research R1's table
  - kind `06` gives `unrecognized-format`
  - `SAV` with non-hex fields, or no `\n` in the first 33 bytes, gives `damaged-save`
  - non-`SAV` input gives `not-a-save`

### Implementation

- [X] T008 Implement `tools/eu5-melter/src/tokens.rs`: a `FlatTokens` struct implementing `jomini::binary::TokenResolver`. It parses the layout "`u16le entryCount+1` (23701), `u16le breakpoint` (9999)", then repeated "`u8 len`, `len` UTF-8 bytes; `len = 0` means no token", with the exact ID rule from T003. It applies an override map `HashMap<u16, String>` before the table lookup. This is a clean-room reader; do not copy pdx-tools' `FlatResolver` (AGPL). T005 must pass.
- [X] T009 Add `tools/eu5-melter/patches/eu5save-quote-lookups.patch` and apply it in `Cargo.toml` by vendoring. The simplest reliable route is to copy `crates/eu5save` at the pinned rev into `tools/eu5-melter/vendor/eu5save/` with the patch applied, and point the dependency at `path = "vendor/eu5save"`. Note the upstream rev and patch in `vendor/eu5save/PATCHED.md`. The patch changes `melt.rs`'s `Token::Lookup` value branch (the `else { wtr.write_unquoted(s.as_bytes())? }` arm) to call `write_quoted` when `s` contains whitespace or any of `={}"#`. T006 must pass. Also file the bug upstream at rakaly/jomini and link the issue in `PATCHED.md`.
- [X] T010 Implement `tools/eu5-melter/src/lib.rs` per contracts/melter-wasm.md:
  - exports `create_resolver(table, overrides: Uint32Array, overrideNames: Vec<String>)`, `melt_metadata(save, &Resolver) -> Vec<u8>`, `melt(save, &Resolver, write: &js_sys::Function) -> MeltStats` (with `unknown_tokens` and `unknown_lookups` getters)
  - `melt` uses `FailedResolveStrategy::Stringify` and streams through a `Write` adapter that buffers 8MB and calls `write(Uint8Array view)`, aborting with `cancelled:` if it returns `false`
  - enforces a 2GB decompressed-`gamestate` cap with a counting reader (`damaged: decompressed size cap exceeded`)
  - maps every error to the prefixes `damaged:` / `unrecognized:` / `cancelled:`
  - `melt_metadata` melts only the metadata section (`Eu5File::meta()`) for research R6's version lookup
- [X] T011 Run `npm run build:melter` and commit the output `src/parser/melter/generated/eu5_melter.js`, `eu5_melter_bg.wasm` and `.d.ts`. Confirm the `.wasm` is on the order of the spike's 238KB.
- [X] T012 [P] Create `src/parser/melter/token-overrides.ts`, exporting `TOKEN_OVERRIDES: Record<string, Record<number, string>> = { "1.3.11": { 0x28de: "strength" } }`. Add a comment citing research R4: pdx.tools' table calls it `unused_strength`, and 1.3.11 saves plus `1.3.11.ts:746` use `strength`.
- [X] T013 Implement `src/parser/save-format.ts`, exporting `parseSaveHeader(bytes: Uint8Array): SaveFormat | { error: ErrorKind }`. It uses data-model.md's SaveFormat fields (`headerVersion`, `kindCode`, `encoding`, `container`, `metadataLength`) and validation ("first 3 bytes must be `SAV`, otherwise `not-a-save`"; "hex fields must parse and a `\n` must fall within the first 33 bytes, otherwise `damaged-save`"; "`kindCode ∉ 0..5` → `unrecognized-format`"). Move `looksLikeSaveFile` here from `src/parser/version-detect.ts`, re-exporting it from there so existing imports keep working. T007 must pass.
- [X] T014 [P] Extend `src/parser/protocol.ts` per contracts/worker-protocol-delta.md:
  - `ParsePhase` gains `"decompressing"`
  - `ErrorKind` gains `"unrecognized-format" | "damaged-save" | "binary-unavailable"`
  - add `interface LoadWarning { kind: "unknown-tokens"; count: number; message: string }`
  - `ReadyMessage` gains `warnings?: LoadWarning[]`
  - Mirror the same additions in `specs/001-save-import-overview/contracts/worker-protocol.md`, with an "Added 2026-09-24 (015)" note.
- [X] T015 Implement `src/parser/melter/melt.ts`:
  - It lazily fetches `public/tokens/eu5.flat` and the `.wasm` (Vite `?url` import of `generated/eu5_melter_bg.wasm`) and caches both bytes per worker. Any fetch or init failure throws a typed `MelterUnavailableError`.
  - `meltSave(save, { onProgress, signal })`:
    1. Instantiate the module fresh with `initSync({ module: wasmBytes })`.
    2. Run `melt_metadata`, read `metadata.version` with the existing jomini `parseText` query `/metadata/version`, and select `TOKEN_OVERRIDES[version] ?? {}`.
    3. Run `melt`, whose `write` callback copies each chunk into a growable JS `Uint8Array`. The initial size is the data-model estimate ("`2.2 × uncompressed gamestate size`… or `8 × file size`"), doubling on overflow. It returns `false` when `signal.aborted`.
    4. Report `decompressing` percent as `outputBytesWritten / estimatedOutputBytes`, capped at 99.
    5. Return `MeltResult { text, unknownTokenCount, unknownLookupCount }`, trimmed to the written length.
    6. Drop all module references before returning (research R8).
  - Error-prefix mapping: `damaged:` and any `WebAssembly.RuntimeError` become `damaged-save`; `unrecognized:` becomes `unrecognized-format`; `cancelled:` becomes an `AbortError`.
- [X] T016 Implement the test-only encoder `tools/eu5-melter/src/encode.rs` (behind feature `encoder`). It tokenizes Clausewitz text and emits EU5 binary using jomini's lexeme constants from `jomini/src/binary/lexer.rs`: `EQUAL 0x0001`, `OPEN 0x0003`, `CLOSE 0x0004`, `I32 0x000c`, `BOOL 0x000e`, `QUOTED 0x000f`, `UNQUOTED 0x0017`, and a `FIXED5_*` family for decimals. Keys are resolved through the reverse of `FlatTokens`, with 1.3.11 overrides applied in reverse. Non-token keys and strings go into a generated `string_lookup` via `LOOKUP_*` for the zip variant, and `QUOTED`/`UNQUOTED` for the plain-binary variant. Dates use the encoding eu5save's `Eu5Date` expects.
- [X] T017 Implement `tools/eu5-melter/src/bin/make-fixtures.rs`. From `tests/fixtures/rus-1628-minimal.eu5` it writes:
  - `tests/fixtures/rus-1628-minimal.bin.eu5`: header kind `01`, correct metadata length
  - `tests/fixtures/rus-1628-minimal.zip.eu5`: kind `03`, binary metadata prefix + zip with `gamestate` and `string_lookup`
  - `tests/fixtures/rus-1628-minimal.ztext.eu5`: kind `02`, text metadata + zip with text `gamestate`

  Then it self-checks that melting each fixture and parsing the result with jomini gives the same document as the source text. Run `npm run generate:save-fixtures` and commit the three fixtures.
- [X] T018 [P] Create `tests/parser/melter.test.ts`, running in Node via `initSync({ module: readFileSync(".../eu5_melter_bg.wasm") })`. It asserts:
  - melting `.bin` and `.zip` gives `unknownTokenCount === 0`, and the text has header `SAV02 00…`
  - jomini-parsing the melt and the text fixture gives deep-equal `metadata`, `countries.tags` and `subunit_manager` subtrees (the latter proves the `strength` override)
  - aborting via the `write` callback surfaces as `AbortError`

**Checkpoint**: The melter works on every generated fixture in isolation. Nothing is routed through it yet.

---

## Phase 3: User Story 1 — Load the save the game actually wrote (P1) 🎯 MVP

**Goal**: A compressed binary save (ironman, normal or multiplayer) loads straight from the save folder and produces the same data as its melted text counterpart.

**Independent Test**: quickstart.md §3. Load `MP_RUS_1628…eu5` in the dev app. It should reach ready with date 1628.8.14, nation Russia, Overview identical to `Russia (Melted).eu5`, and regiment strength showing on Firepower.

- [X] T019 [US1] Add format-equivalence tests to `tests/parser/load-save.test.ts`. Running `loadSave` on `rus-1628-minimal.zip.eu5` and on `rus-1628-minimal.bin.eu5` must each give `onReady` with `inGameDate === "1628.8.14"`, and must write exactly the same rows as the text fixture in every table the adapter fills (compare `queryRows` output table by table, including `regiments.strength`). `onProgress` must have been called with phase `"decompressing"`. Write the tests before T020; they must fail until T020 lands.
- [X] T020 [US1] Route by format in `src/parser/load-save.ts`:
  1. After `readFileAsBytes`, call `parseSaveHeader`. Error results go to `callbacks.onError(kind, message)` using contracts/worker-protocol-delta.md's messages.
  2. For `kindCode === 0`, the existing path runs unchanged.
  3. Otherwise, emit `onProgress("decompressing", …)`, call `meltSave(data, { onProgress, signal })`, and replace `data` with `result.text` before `detectVersion`. The adapter call is unchanged.
  4. Build `warnings: LoadWarning[]` when `unknownTokenCount + unknownLookupCount > 0`, with message "N fields in this save weren't recognized; some data may be incomplete."
  5. Extend `LoadCallbacks.onReady`'s result type with `warnings?`.
  6. Map `MelterUnavailableError` to `binary-unavailable`, and melter `damaged`/`unrecognized` errors to their kinds.
  7. Let the melt's `AbortError` fall into the existing `signal.aborted` early return.
  8. Release the original `data` reference once melted, so the 84MB input can be GC'd.
- [X] T021 [US1] Pass `warnings` through in `src/parser/worker.ts` (the `reportReadyAndSupersede` result type and the `post({ type: "ready", ... })`).
- [X] T022 [P] [US1] Show the phase and warnings in `src/components/Overview/FileLoader.tsx`: label the new `decompressing` phase in the progress UI (e.g. "Decompressing save…"), and render `ready.warnings` as a dismissible, non-blocking notice above the loaded view. Use the app's existing styling. Per memory, never use `title=` tooltips.
- [X] T023 [US1] Manual verification per quickstart.md §3 steps 1–4 in a real Chrome session with `npm run dev`:
  - binary vs melted Overview figures are identical
  - Firepower shows regiment strength
  - load time and Chrome Task Manager peak memory are both ≤1.5× the melted file (SC-003); record the numbers in research.md §R8 as "Measured in browser"
  - cancel during `decompressing` leaves no orphaned OPFS database

**Checkpoint**: The MVP is complete. Players can load the save the game writes.

---

## Phase 4: User Story 3 — Existing text saves keep working (P1)

**Goal**: Uncompressed text saves behave exactly as before, with no melter involved.

**Independent Test**: quickstart.md §2. `Russia (Melted).eu5` loads with no `decompressing` phase and identical results, within ±5% of `main`'s load time.

- [X] T024 [US3] Add a test to `tests/parser/load-save.test.ts`: loading the plain `rus-1628-minimal.eu5` never calls `onProgress` with `"decompressing"`, and never touches the melter (`vi.spyOn` on `melter/melt`'s `meltSave` expects 0 calls). Check that all pre-existing `load-save`, `adapter` and `version-detect` tests still pass unchanged.
- [ ] T025 [US3] **Deferred at close-out 2026-09-25 (user decision): not run; the text path changed only by an O(1) header check.** Manual timing per quickstart.md §2. Load `Russia (Melted).eu5` on this branch and on `main` (3 runs each) and confirm the difference is ≤5% (SC-004). Record the result in research.md §R8.

---

## Phase 5: User Story 2 — Load a compressed text save (P2)

**Goal**: Zipped text saves (kind `02`, and `04` where encountered) load like any other save.

**Independent Test**: `rus-1628-minimal.ztext.eu5` loads and gives the same rows as the plain text fixture.

- [X] T026 [US2] Add a test to `tests/parser/load-save.test.ts`: `loadSave` on `rus-1628-minimal.ztext.eu5` gives `onReady`, rows identical to the text fixture, and no `warnings` (text melt copies through, so there are no unknown tokens).
- [X] T027 [US2] If T026 fails, fix it in `src/parser/melter/melt.ts` or `tools/eu5-melter/src/lib.rs`. The likely area is the zip text-copy path in `Eu5Melt for &JominiZip`, which writes a new `SAV…00` header. Make sure the metadata length in the rewritten header is correct for our downstream header check.

---

## Phase 6: User Story 4 — Clear messages when a save can't be read (P2)

**Goal**: Every failure category shows its own plain-language message. No raw parser errors reach the player.

**Independent Test**: quickstart.md §5, plus the automated error-path tests below.

- [X] T028 [P] [US4] Generate the error fixtures with `make-fixtures.rs`, extending T017:
  - `tests/fixtures/damaged-truncated.zip.eu5`: `rus-1628-minimal.zip.eu5` cut to 60% of its length
  - `tests/fixtures/damaged-badzip.zip.eu5`: the zip central directory overwritten with zeros
  - `tests/fixtures/unknown-kind.eu5`: the text fixture with header kind `06`
  - `tests/fixtures/unknown-tokens.bin.eu5`: the `.bin` fixture with one key token replaced by an unused ID, e.g. `0x5c90`
- [X] T029 [US4] Add error-path tests to `tests/parser/load-save.test.ts`:
  - `damaged-truncated` and `damaged-badzip` → `onError("damaged-save", …)`
  - `unknown-kind` → `onError("unrecognized-format", …)`
  - with `meltSave`'s token fetch mocked to reject, `rus-1628-minimal.zip.eu5` → `onError("binary-unavailable", …)`, while the plain text fixture still loads
  - `unknown-tokens.bin.eu5` → `onReady` with `warnings[0].kind === "unknown-tokens"` and `count ≥ 1`
  - in every error case, no OPFS database is left behind (reuse the file's existing `deleteSaveDatabase` spy pattern)
- [X] T030 [US4] Add the three new kinds to `src/components/Overview/ErrorMessage.tsx`, using contracts/worker-protocol-delta.md's messages verbatim:
  - `unrecognized-format`: "This save uses a format NauticalBeg doesn't recognize. It may come from a newer game version."
  - `damaged-save`: "This save file appears damaged or incomplete. Try copying it again from your EU5 save games folder."
  - `binary-unavailable`: "Ironman and binary saves can't be read right now. You can still load a text save (a debug-mode save, or one converted with rakaly melt)."

  Update any exhaustive `ErrorKind` switch and its tests.
- [X] T031 [US4] Manual error checks per quickstart.md §5: a truncated real binary save → damaged; a `.png` → not-a-save; `/tokens/eu5.flat` blocked in DevTools → binary-unavailable, after which the melted save still loads.

---

## Phase 7: Polish & Cross-Cutting

- [X] T032 [P] Write `tools/eu5-melter/cross-check.mjs` per quickstart.md §4. It melts a save with the committed WASM (including overrides chosen by version), then streams it line by line against a `rakaly melt` output and prints every **key-name** difference, ignoring quoting-only differences. It exits non-zero if any are found. Run it against the real `MP_RUS_1628` save and confirm it prints nothing.
- [X] T033 [P] Update `ARCHITECTURE.md` with a "Save formats & the EU5 melter" section covering:
  - header routing (R1)
  - the MIT-crate vs AGPL decision (R2)
  - the token asset, its permission and the ID-mapping gotcha (R3)
  - version overrides (R4)
  - the vendored quoting patch (R5)
  - streamed output and per-load instances (R8)
  - "committed WASM; Rust only needed to rebuild" (R9)
- [X] T034 [P] Update `specs/001-save-import-overview/research-save-format.md`'s "File shape" section to note that real game saves are `SAV0203` compressed binary and are melted in-browser as of 015, linking to this feature's research.md.
- [X] T035 Run the full `npm test`, `npm run build` and `cargo test --manifest-path tools/eu5-melter/Cargo.toml` (default and `--features encoder`). All must pass.
- [X] T036 Session wrap-up per the project convention:
  - mark tasks complete here
  - refresh `specs/spec-status.md`
  - make a scoped commit of only 015's files. The working tree also holds 014's uncommitted changes, so do not include those.

---

## Dependencies & Execution Order

- **Setup (T001–T004)**: T002 and T003 are parallel; T004 needs T001.
- **Foundational (T005–T018)**:
  - T005–T007 (tests) come first.
  - T008 → T009 → T010 → T011 (Rust chain).
  - T012, T013 and T014 are parallel with the Rust chain.
  - T015 needs T011, T012 and T014.
  - T016 → T017 need T008 and T009.
  - T018 needs T011 and T017.
- **US1 (T019–T023)** needs all of Foundational. T019 comes before T020. T021 and T022 follow T020. T023 is last.
- **US3 (T024–T025)** needs T020, and can run alongside US2 and US4.
- **US2 (T026–T027)** needs T020.
- **US4 (T028–T031)**: T028 needs T017; T029 needs T020 and T028; T030 needs T014.
- **Polish (T032–T036)**: after the stories. T032–T034 are parallel.

### Story dependency graph

```text
Setup → Foundational → US1 (MVP) ─┬─→ US3
                                  ├─→ US2
                                  └─→ US4 → Polish
```

## Parallel Example: Foundational

```text
In parallel: T005 (Rust token tests), T006 (quoting test), T007 (save-format.test.ts)
Then in parallel with the Rust chain T008→T011: T012 (overrides), T013 (save-format.ts), T014 (protocol.ts)
```

## Parallel Example: after US1

```text
US3 (T024–T025), US2 (T026–T027) and US4's T028 + T030 touch different files and can proceed together
```

## Implementation Strategy

1. **MVP = Setup + Foundational + US1.** This alone delivers the headline value: the save the game writes loads with no external tool. Stop and verify with quickstart.md §3 (T023) before going further.
2. Then US3 (regression proof), US2 (compressed text, nearly free) and US4 (error polish).
3. Every Rust change goes through `npm run build:melter`, and the regenerated `generated/` output is committed in the same change, so the app never depends on a local Rust toolchain.
