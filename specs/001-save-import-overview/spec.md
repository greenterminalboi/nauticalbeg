# Feature Specification: Save Import & Overview

**Feature Branch**: `001-save-import-overview`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Save file upload, parsing, and a basic overview visualization for EU5 save files — the MVP slice that lets a player load their exported Europa Universalis V save and see a first useful summary of their game state, ahead of richer visualizations and the AI copilot feature."

## Clarifications

### Session 2026-09-17

- Q: What is a realistic save file size the tool must handle, for setting performance targets and scale assumptions? → A: Real EU5 saves can be 500–600MB uncompressed; this is the "typical" scale the tool must design and test against, not an outlier case.
- Q: Given that scale, should the tool persist a loaded save's data across browser sessions by default, never, or only when the user explicitly opts in per save? → A: Opt-in per save — a save is only kept across sessions if the user explicitly chooses to keep it; otherwise it is cleared when the session ends.
- Q: Does this feature need to support multiple in-game dates (e.g., historical snapshots or a timeline) for a loaded save, or only the single date the save itself is on? → A: Single date only — the overview reflects the one in-game date embedded in the loaded save; no historical/multi-date tracking is part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load a save file (Priority: P1)

A player who has exported a save from Europa Universalis V opens the tool and
selects that save file so the tool can read it and confirm it loaded correctly.

**Why this priority**: Nothing else in the product is possible until a save can
be loaded. This is the foundational capability the whole tool depends on.

**Independent Test**: Can be fully tested by selecting a valid, supported EU5
save file and confirming the tool acknowledges it loaded (e.g., shows the
player's nation name and in-game date) without any further visualization work.

**Acceptance Scenarios**:

1. **Given** the tool is open with no save loaded, **When** the user selects a
   valid, supported EU5 save file, **Then** the tool parses it and indicates
   success, identifying at minimum the player's nation and the save's in-game
   date.
2. **Given** a save is already loaded, **When** the user selects a different
   valid save file, **Then** the tool replaces the current session's data with
   the newly loaded save.

---

### User Story 2 - See a basic overview (Priority: P2)

Once a save is loaded, the player wants an at-a-glance summary of their
nation's current state without hunting through EU5's own UI.

**Why this priority**: This is the first slice of the tool's core value
proposition (visualization beyond EU5's built-in UI), but it depends on
Story 1 being complete first.

**Independent Test**: Can be fully tested by loading a valid save and
confirming an overview screen renders with the player nation's identity, date,
and a defined set of key stats — independent of any later, richer
visualizations (maps, time-series, comparisons).

**Acceptance Scenarios**:

1. **Given** a save has been successfully loaded, **When** parsing completes,
   **Then** the tool displays an overview showing the player nation's name,
   the current in-game date, and key stats: total development, number of
   provinces owned, treasury, stability, government type, and current war
   status.
2. **Given** the overview is displayed, **When** the user inspects any stat
   that is computed/derived from multiple raw values (e.g., total development
   summed across provinces) rather than read directly from a single save
   field, **Then** that stat is visually distinguished as derived rather than
   presented identically to directly-read values.

---

### User Story 3 - Understand failures clearly (Priority: P3)

A player selects a file that turns out to be invalid, corrupted, or from an
unsupported game version, and needs to understand what went wrong instead of
seeing a broken or blank screen.

**Why this priority**: Important for trust and usability, but the tool
delivers no value at all if Stories 1–2 aren't solid first; this hardens the
unhappy path around them.

**Independent Test**: Can be fully tested by attempting to load a non-save
file, a truncated/corrupted save, and a save from an unsupported game version,
and confirming each produces a distinct, clear, actionable message rather than
a crash or silent failure.

**Acceptance Scenarios**:

1. **Given** the user selects a file that is not a recognizable EU5 save,
   **When** the tool attempts to read it, **Then** the tool shows a clear
   message that the file isn't a recognized EU5 save, without crashing.
2. **Given** the user selects a save from a game version the tool does not
   explicitly support, **When** the tool detects the version, **Then** the
   tool refuses to render a (potentially incorrect) overview and instead
   clearly states the save's version is unsupported.
3. **Given** the user selects a truncated or corrupted save file, **When**
   parsing fails partway through, **Then** the tool reports that parsing
   failed rather than silently showing a partial or blank overview.

---

### User Story 4 - Keep a save across sessions (Priority: P4)

A player who expects to keep coming back to the same save doesn't want to
re-upload it (potentially 500-600MB) every time they open the tool, so they
explicitly choose to keep it available locally.

**Why this priority**: A convenience layer on top of the core load-and-view
flow. It adds real value but the tool is fully usable without it, and it
depends on Stories 1–2 being solid first.

**Independent Test**: Can be fully tested by loading a save, choosing to keep
it, closing and reopening the tool, and confirming that save's overview is
available again without re-uploading — independent of any richer
visualization or AI copilot work.

**Acceptance Scenarios**:

1. **Given** a save has been successfully loaded, **When** the user chooses
   to keep it, **Then** the tool persists that save's parsed data locally so
   it is available on the next visit without re-uploading.
2. **Given** a previously kept save exists, **When** the user opens the tool
   in a new session, **Then** the tool offers to resume that kept save rather
   than requiring an immediate re-upload.
3. **Given** a kept save exists, **When** the user explicitly clears/forgets
   it, **Then** its persisted data is removed from local storage.
4. **Given** the user has not chosen to keep a save, **When** the session
   ends (tab closed or refreshed), **Then** that save's data is not retained,
   consistent with FR-005's default.

---

### Edge Cases

- What happens with a large save at the expected baseline scale (up to
  ~500–600MB uncompressed)? The tool must show loading progress rather than
  appear frozen, and must still complete within the SC-001 target.
- What happens with an outlier save well beyond the baseline (e.g., an
  extremely long multi-century campaign with heavy mods)? The tool should
  still complete without crashing or exhausting browser memory, even if it
  takes longer than the SC-001 target.
- What happens when the save is a multiplayer save containing more than one
  human-controlled nation? (See Assumptions — v1 defaults to a single primary
  nation.)
- How does the tool behave if the user cancels a file selection mid-way or
  selects an empty file?
- How does the tool handle a save where the player's nation has been annexed,
  destroyed, or the player is in observer mode with no controlled nation?
- What happens if the user attempts to load a second save while the first is
  still being parsed?
- What happens if the user chooses to keep a new save while a different save
  is already kept? (See Assumptions — v1 keeps only one save at a time; kept
  saves replace each other.)
- What happens if persisting a kept save would exceed the browser's available
  local storage space? The tool must report this clearly rather than silently
  failing to keep the save or corrupting existing data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to select a local EU5 save file from their
  device to load into the tool.
- **FR-002**: System MUST validate that a selected file is a recognizable EU5
  save format before attempting a full parse, and MUST reject unrecognized
  files with a clear message rather than attempting to parse them.
- **FR-003**: System MUST parse a valid, supported save file into a structured
  representation of a single point-in-time snapshot of the game state — the
  one in-game date embedded in that save — sufficient to identify the
  player's nation, that date, and the key stats listed in User Story 2. This
  feature does not track or reconstruct any other date; a save loaded twice
  always yields the same single date.
- **FR-004**: System MUST detect the save's game version and MUST refuse to
  render an overview for versions it does not explicitly support, showing a
  clear "unsupported version" message instead.
- **FR-005**: System MUST NOT modify the user's original save file, and MUST
  NOT retain the uploaded save's contents beyond the active session unless the
  user explicitly opts in to persistence.
- **FR-006**: System MUST display, after successful parsing, an overview
  showing the player nation's name, current in-game date, total development,
  number of provinces owned, treasury, stability, government type, and
  current war status.
- **FR-007**: System MUST visually distinguish any overview value that is
  derived/computed from underlying save data (e.g., a sum or aggregate) from
  values read directly from a single save field.
- **FR-008**: System MUST show progress feedback to the user whenever loading
  or parsing a save is expected to take longer than one second.
- **FR-009**: System MUST report a clear, specific error (distinguishing
  "not a save file," "unsupported version," and "corrupted/failed to parse")
  when a selected file cannot be successfully loaded, without the page
  crashing or freezing.
- **FR-010**: Users MUST be able to load a different save file at any time,
  which replaces the currently loaded session's data.
- **FR-011**: Users MUST be able to explicitly choose to "keep" a loaded
  save so its parsed data persists locally across browser sessions, rather
  than being cleared when the session ends.
- **FR-012**: System MUST NOT persist a save's data across sessions unless
  the user has explicitly chosen to keep that specific save; the default for
  every save remains session-only (per FR-005).
- **FR-013**: Users MUST be able to clear/forget a previously kept save,
  removing its persisted data from local storage.
- **FR-014**: System MUST report clearly if keeping a save would exceed
  available local storage space, without corrupting any existing kept save
  or silently failing.

### Key Entities

- **Save File**: The user-provided EU5 export selected for this session.
  Relevant attributes: detected game version, in-game save date, its raw
  contents, and whether the user has chosen to keep it (persisted) or not
  (session-only, the default).
- **Parsed Game State**: The structured representation extracted from a Save
  File once parsing succeeds. Includes the in-game date and enough detail
  about nations and provinces to compute the overview stats.
- **Player Nation**: The specific country identified as human-controlled/
  player-owned within the loaded save. Relevant attributes: name/tag,
  development, province count, treasury, stability, government type, and
  war status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a typical save file (up to approximately 500–600MB
  uncompressed, matching real-world EU5 saves), a user sees their nation's
  overview within 60 seconds of selecting the file, with visible progress
  feedback throughout (per FR-008) rather than an unresponsive wait.
- **SC-002**: 95% of valid, supported-version EU5 save files parse
  successfully and produce a correct overview on the first attempt.
- **SC-003**: 100% of unsupported, corrupted, or non-save file selections
  result in a clear, specific explanatory message rather than a blank screen,
  a crash, or an indefinitely frozen loading state.
- **SC-004**: A user can identify their nation's name, the current in-game
  date, and all six key stats on the overview screen without consulting any
  external documentation or help text.
- **SC-005**: A user who chooses to keep a save can return in a later
  session and see that save's overview without re-uploading it, every time,
  until they explicitly clear it or replace it with a different kept save.

## Assumptions

- Save files are provided directly by the user from their local device (e.g.,
  a browser file picker); the tool does not fetch saves from a remote or
  cloud save-game service in this feature.
- If a loaded save is a multiplayer save containing more than one
  human-controlled nation, v1 shows the overview for a single primary nation
  (e.g., the first human-controlled nation found); selecting among multiple
  human nations is deferred to a future feature.
- "Typical" save size for the SC-001 performance target is up to
  approximately 500–600MB uncompressed, reflecting real-world EU5 saves;
  this is the baseline scale the tool must be designed for, not an edge
  case. Even larger outlier saves (e.g., very long multi-century games with
  heavy mods) may take longer and are not held to the SC-001 target in v1.
- The specific set of EU5 game versions supported by v1 will be finalized
  during planning based on the versions available at implementation time;
  this feature only requires that version detection and the unsupported-
  version failure path (FR-004) exist, not a specific version list.
- No user accounts or authentication are required for this feature — loading
  and viewing a save's overview is anonymous and local to the session.
- v1 supports keeping only one save persisted at a time; choosing to keep a
  new save replaces any previously kept save. Managing a library of multiple
  kept saves is deferred to a future feature.
- The specific local storage mechanism used to keep a save (e.g., which
  browser storage API or embedded database) is a technical decision made
  during planning; this spec only requires the user-facing behavior in
  FR-011–FR-014 and SC-005, not a specific implementation.
- This feature has no concept of multiple dates, a timeline, or historical
  snapshots — each loaded save has exactly one in-game date, and the
  overview always reflects that single date. Tracking a nation's history
  across multiple dates/saves is explicitly out of scope and deferred to a
  future time-series visualization feature.
