# Feature Specification: Save Format Support (Compressed & Ironman Saves)

**Feature Branch**: `015-save-format-support`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Accept both ironman and non-ironman save files, compressed and uncompressed save files as well." Expanded after format research: accept every EU5 save variant the game produces — uncompressed text, compressed text, uncompressed binary, and compressed binary (ironman / normal / multiplayer) — converting binary saves to plaintext in the browser and running them through the existing text parser unchanged.

## Background (research findings, 2026-09-24)

- Today the app only accepts **uncompressed text** saves: debug-mode saves, or files already converted to text with the external `rakaly melt` tool (e.g. `Russia (Melted).eu5`, header `SAV0200…`).
- What the game actually writes by default is a **compressed binary** save (header `SAV0203…`). Confirmed on the real 84MB `MP_RUS_1628_08_14_….eu5`: a ~405KB metadata prefix followed by a zip archive containing `gamestate` (310MB) and `string_lookup` (19MB). Its content matches the 642MB melted file.
- Before this feature, such a file passes the "is this a save" header check and then fails deep inside the text parser with a confusing error.
- Binary saves store field names as numeric IDs. Turning them back into names needs the **EU5 token table**, which Paradox does not publish.

### Token-table permission & licensing (recorded 2026-09-24)

- **Permission**: The project owner obtained permission from pdx.tools on 2026-09-24 to use pdx.tools' EU5 token file (served as `/assets/eu5-*.bin`, zstd-compressed, ~85KB, ~330KB decompressed) in NauticalBeg.
- **Licensing boundary**: pdx-tools' own code (including its compiled EU5 WASM module) is AGPL-3.0 and MUST NOT be bundled. Binary decoding is built from the MIT-licensed rakaly/jomini `eu5save` crate. The only thing taken from pdx.tools is the permitted token data.
- The permission covers pdx.tools' distribution of the token data. It is not a statement from Paradox Interactive. The jomini README notes the tokens are withheld from its repo "per PDS counsel". If Paradox or pdx.tools later withdraws permission, the fallback is the "no token table available" path (FR-008). Text saves keep working either way.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load the save the game actually wrote (Priority: P1)

A player drops the `.eu5` file straight from their `save games/` folder into NauticalBeg. It's a normal compressed binary save, which may be ironman or multiplayer. It loads with the same progress feedback as today and lands on the same Overview, map and tabs a melted text save would, with no extra tool and no manual conversion step.

**Why this priority**: This is the default file every EU5 player has. Without this, every user has to discover and run a command-line melter first, which is the biggest barrier to using the tool at all.

**Independent Test**: Load the real `MP_RUS_1628_08_14_….eu5` (compressed binary) and confirm it reaches "ready" with the same in-game date, player nation and Overview figures as loading its melted counterpart `Russia (Melted).eu5`.

**Acceptance Scenarios**:

1. **Given** a compressed binary EU5 save (ironman, normal single-player, or multiplayer), **When** the player loads it, **Then** it reaches the loaded state and every tab shows data, just as the melted text version of the same save would.
2. **Given** the real `MP_RUS_1628` compressed binary save and its melted counterpart, **When** each is loaded separately, **Then** the in-game date, player nation, and the Overview's headline figures are identical.
3. **Given** a compressed binary save is loading, **When** decompression and conversion take more than a second, **Then** the player sees progress that updates at least once per second, not a frozen or unchanging indicator.
4. **Given** a binary save is loading, **When** the player cancels, **Then** loading stops and nothing from the partial load is left behind, as with text saves today.

---

### User Story 2 - Load a compressed text save (Priority: P2)

A player who saves in debug mode, or uses a tool that writes zipped text saves, loads that file. It loads like any other save.

**Why this priority**: Less common than binary saves, but it uses the same zip envelope as User Story 1, so supporting it costs almost nothing once the envelope is handled. Leaving it out would make the "all save formats" promise false.

**Independent Test**: Load a compressed text save (text gamestate inside the zip envelope) and confirm it reaches the loaded state with correct Overview data.

**Acceptance Scenarios**:

1. **Given** a compressed text EU5 save, **When** the player loads it, **Then** it loads and shows the same data as the equivalent uncompressed text save.

---

### User Story 3 - Existing text saves keep working (Priority: P1)

A player loads an uncompressed text save (debug-mode or rakaly-melted), which is the only kind supported today. It behaves exactly as before, with no slowdown and no change in output.

**Why this priority**: Regression protection for the one format that already works and that all existing verification is built on.

**Independent Test**: Load `Russia (Melted).eu5` and the committed test fixture. Confirm output is unchanged and the existing test suite passes.

**Acceptance Scenarios**:

1. **Given** an uncompressed text save, **When** the player loads it, **Then** it loads with identical results and no noticeable change in load time.

---

### User Story 4 - Clear messages when a save can't be read (Priority: P2)

When a file can't be loaded, the player is told why in plain language, and what to do where there's anything they can do. That covers a corrupt or truncated download, a damaged archive, a binary save when the token table isn't available, and a non-save file.

**Why this priority**: With four formats there are more ways to fail. Today a binary save fails with a confusing low-level parser error, which Constitution Principle II forbids.

**Independent Test**: Load a truncated compressed save, a save with a damaged archive, and a non-save file. Also simulate the token table being unavailable. Confirm each shows its own distinct, understandable message.

**Acceptance Scenarios**:

1. **Given** a compressed save whose archive is damaged or cut short, **When** the player loads it, **Then** they see a message saying the save file appears damaged or incomplete, and suggesting they re-copy it from the game's save folder.
2. **Given** a binary save and no token table available, **When** the player loads it, **Then** they see a message saying binary/ironman saves can't be read right now. The message names the workaround: load a text (debug/melted) save instead.
3. **Given** a binary save containing some field IDs the token table doesn't know (e.g. after a game patch), **When** it loads, **Then** loading still completes. The player sees a non-blocking warning that some data may be incomplete, and those fields are neither silently dropped nor shown as real data.
4. **Given** a file that isn't an EU5 save, **When** the player loads it, **Then** they get today's "not a recognized EU5 save" message.

---

### Edge Cases

- **Header says compressed but no archive is found**, or the archive has no `gamestate` entry: reported as damaged (US4 scenario 1), never as an unsupported version.
- **Truncated file**, e.g. an interrupted copy or download: reported as damaged or incomplete, not as a generic parse failure.
- **Unknown field IDs after a game patch**: loading continues and a warning is shown (US4 scenario 3). If the version detected from metadata isn't one the app supports, the existing unsupported-version error still applies (Constitution Principle III).
- **Kept (persisted) saves**: already stored as parsed data, so resuming never re-reads the original format. Behavior is unchanged.
- **Memory pressure**: a 310MB binary gamestate converts to roughly 640MB of text, about what the app already handles for melted saves. Peak memory during conversion must not greatly exceed today's melted-text load (see SC-003).
- **Token table fails to load**, e.g. the asset is missing or corrupt: treated as "no token table available" (US4 scenario 2). Text saves remain unaffected.
- **Unrecognized format code in the header**: rejected with a clear "unrecognized save format" message rather than attempting a parse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST identify a save's format (text or binary, compressed or uncompressed) from its header before parsing, and route it accordingly.
- **FR-002**: The system MUST accept uncompressed text saves with behavior and output identical to before this feature.
- **FR-003**: The system MUST accept compressed text saves by extracting the game-state content from the save's archive and parsing it as text.
- **FR-004**: The system MUST accept uncompressed binary saves and compressed binary saves (including ironman and multiplayer) by converting them to the equivalent plaintext, then parsing that through the same version detection and version adapter as text saves. Downstream data MUST be identical regardless of input format.
- **FR-005**: All decompression and conversion MUST happen on the user's device, off the main UI thread. The save's contents MUST NOT be sent anywhere (Constitution Principles I and V).
- **FR-006**: Loading any format MUST report progress at least once per second, through each stage: reading, decompressing, converting and parsing.
- **FR-007**: Cancelling during decompression or conversion MUST stop the work and clean up the partial load, exactly as cancelling does for text saves today.
- **FR-008**: If binary conversion is impossible because the token table is unavailable, the system MUST show a distinct, actionable error rather than a generic parse failure.
- **FR-009**: When a binary save contains field IDs missing from the token table, the system MUST complete the load, keep those fields in a clearly-unknown form rather than dropping them, and show the player a visible warning that some data may be incomplete (Constitution Principle II: no silent partial parses).
- **FR-010**: A damaged or truncated archive, or a missing game-state entry, MUST produce a distinct "damaged or incomplete save" error.
- **FR-011**: The binary-conversion capability MUST be built only from permissively-licensed (MIT-compatible) code. The AGPL-licensed pdx-tools code and compiled modules MUST NOT be bundled.
- **FR-012**: The token data MUST be sourced from pdx.tools under the permission recorded above. Its source and the permission MUST be documented in the repository alongside the shipped data.
- **FR-013**: Each supported format MUST have a committed test fixture and a regression test asserting its parsed output (Constitution Principle II). For binary, this includes a test that a converted binary fixture produces the same output as its text equivalent.

### Key Entities

- **Save Format**: the header-declared encoding of a save file: text or binary, compressed or uncompressed. It decides whether the save is decompressed and converted before the existing text pipeline runs.
- **Save Envelope**: the container around the game state: a header line, a metadata section, and, for compressed saves, an archive holding the game state and a string lookup table.
- **Token Table**: the mapping from numeric field IDs to field names that binary saves need. It's shipped with the app as permitted data from pdx.tools (see Background).
- **Load Warning**: a non-blocking notice attached to a successful load, e.g. "N unknown fields encountered", shown to the player.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can load the file the game wrote to their save folder directly, with no external tool. 100% of the four save formats load successfully when given a valid file.
- **SC-002**: The real 84MB compressed binary save and its 642MB melted counterpart produce identical in-game date, player nation and Overview figures.
- **SC-003**: The real 84MB compressed binary save loads in no more than 1.5× the time of its melted text counterpart, with peak memory no more than 1.5× the melted-text load, on the same machine.
- **SC-004**: Load time for existing uncompressed text saves changes by no more than 5%.
- **SC-005**: Every failure category (not a save, unrecognized format, damaged/incomplete, binary saves unavailable, unsupported version) shows its own distinct message. None of them surfaces a raw low-level parser error to the player.

## Assumptions

- The four formats are identified by the header's format code: `00` is uncompressed text and `03` is compressed binary, both confirmed on real files. `01` and `02` are assumed to be uncompressed binary and compressed text, following the format shared by EU5 and sibling Jomini-engine titles. This will be verified against real or constructed samples during planning.
- The token table from pdx.tools matches the game version the app currently supports (1.3.11). When the app adds a new game version, the token table's coverage for it must be rechecked as part of that version's adapter work.
- Shipping the token table (a list of internal field-name identifiers) is treated like the Encyclopedia-data exception in the constitution: factual identifier data, not art or creative assets. It is shipped under the explicit permission recorded above.
- Converting binary saves to text and reusing the existing text parser is preferred over writing a second, binary-native parser. It keeps one parsing path (Constitution Principle VII) and guarantees identical downstream output (FR-004).
- A small binary fixture can be produced for tests, either by trimming a real binary save or by converting the existing text fixture to binary with the same token table. Planning picks the method.
