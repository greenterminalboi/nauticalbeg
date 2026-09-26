# Feature Specification: Share Game State by Link

**Feature Branch**: `017-share-game-state`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "A player who has loaded a save in NauticalBeg can click Share and get a link; anyone who opens the link sees that same loaded game state in NauticalBeg (all tabs, map, etc.) without needing the save file." Decisions the owner made on 2026-09-25:
- share links, not just a file export
- links expire after 7 days
- links can't be extended; sharing again creates a fresh one-week link
- hosted on the existing public site (https://nauticalbeg.pages.dev, feature 016), with snapshot storage on the same provider
- target $0/month at beta traffic
- abuse limits: a snapshot size cap and rate limiting

Constitution Principle I requires explicit opt-in before any save data is kept on a server.

## Background (as of 2026-09-25)

- NauticalBeg is client-only. After a save is parsed, its whole game state lives in a per-save database in the visitor's own browser storage. Every tab and the map read only from that database; none of them go back to the original file. So the game state that needs sharing is that parsed database, not the save file itself.
- Today nothing leaves the visitor's device. This feature is the first to send game data to a server, and the first server-side part of the project. The constitution allows this only with explicit opt-in, and requires documenting what is stored, for how long, and why.
- A parsed save can contain more than the map and statistics:
  - the original **file name**
  - a **raw-sections** table holding parts of the save the app doesn't interpret yet
  - in multiplayer saves, **players' in-game or account names**

  Sharing has to consider what goes out.
- The real 85MB compressed multiplayer save (`MP_RUS_1657_…`) melts to a ~310MB text game state. The size of the parsed database, and how small it compresses, hasn't been measured yet. That number drives the size cap and the free-tier cost estimate. The earlier estimate assumed ~10MB per snapshot.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share what I'm looking at (Priority: P1)

A player has their campaign loaded and wants to show a friend. They click **Share**. NauticalBeg explains in one short message what will be uploaded, how long it stays (7 days), and that anyone with the link can see it. The player confirms, sees upload progress, and gets a link they can copy. The link opens straight to the shared game.

**Why this priority**: It's the whole point of the feature. Without creating a link, there's nothing to open.

**Independent Test**: Load `MP_RUS_1657_…eu5`, click Share, confirm, and check that a link is produced and copied, and that the confirmation states the expiry date.

**Acceptance Scenarios**:

1. **Given** a loaded save, **When** the player clicks Share, **Then** they see what will be uploaded, that it expires in 7 days, and that anyone with the link can view it, and nothing is uploaded until they confirm.
2. **Given** the player confirms, **When** the upload takes more than a second, **Then** they see progress updating at least once per second, and can cancel.
3. **Given** the upload finishes, **When** the link appears, **Then** it can be copied with one click and shows the exact date and time it expires.
4. **Given** the player cancels at the confirmation step, **When** they return to the app, **Then** nothing has been uploaded.
5. **Given** no save is loaded, **When** the player looks for Share, **Then** it is unavailable.

---

### User Story 2 - Open a shared game (Priority: P1)

A friend opens the link. They have no save file, no account and may never have used NauticalBeg. The shared game loads with the usual progress feedback and lands on the same Overview, map, map modes and tabs the sharer sees, with the same numbers. They can explore it freely. A clear label shows it's a shared game and when it expires.

**Why this priority**: A link that can't be opened is worthless. US1 and US2 together are the minimum useful feature.

**Independent Test**: In a fresh browser profile, open the link made in US1's test and confirm that the in-game date, player nation, Overview figures and a sample of map modes match the sharer's session.

**Acceptance Scenarios**:

1. **Given** a valid link, **When** anyone opens it, **Then** the shared game loads and every tab and map mode shows the same data as the sharer's session.
2. **Given** a shared game is open, **When** the viewer looks at the top bar, **Then** it clearly says it's a shared game and when the link expires, instead of showing a local file name.
3. **Given** a viewer opens a shared game, **When** they want to analyse their own save instead, **Then** they can load it the normal way, which replaces the shared game.
4. **Given** a viewer has loaded a shared game, **When** they close the tab and open the link again within 7 days, **Then** it opens again.

---

### User Story 3 - Links expire and can't be abused (Priority: P1)

Every link stops working 7 days after it was created, and the stored game data is deleted. Sharing the same game again makes a new, independent 7-day link; the old link keeps its own expiry. Oversized uploads and bursts of uploads are refused with a clear message.

**Why this priority**: The constitution and the $0 budget both depend on this. Without expiry and limits, the stored data grows forever and can be abused.

**Independent Test**: Create a link with a shortened test expiry, confirm it opens before expiry and shows the "expired" message after. Separately, try an upload over the size cap and a burst over the rate limit, and confirm both are refused with clear messages.

**Acceptance Scenarios**:

1. **Given** a link more than 7 days old, **When** anyone opens it, **Then** they see a plain "This shared game has expired" message offering to load their own save, not an error or a blank page.
2. **Given** a link has expired, **When** the storage is inspected, **Then** its game data is gone within 24 hours of expiry.
3. **Given** a player already shared a game, **When** they share it again, **Then** they get a new link with a fresh 7-day expiry, and the first link still expires on its original date.
4. **Given** a game state larger than the size cap, **When** the player tries to share it, **Then** they're told before any upload happens that it's too large, with the size and the limit.
5. **Given** more share attempts from one visitor than the rate limit allows, **When** they try again, **Then** they're told to wait and roughly how long.
6. **Given** a link that never existed or was mistyped, **When** it's opened, **Then** the viewer sees "This shared game wasn't found", distinct from "expired".

---

### User Story 4 - Take a shared link down early (Priority: P3)

A sharer changes their mind, for example because a link was posted somewhere public. From the same browser they shared from, they can delete the link. After that it behaves like an expired link.

**Why this priority**: It's a good privacy backstop, but links already die in 7 days, so the feature works without it.

**Independent Test**: Share, then delete from the same browser. Confirm that the link now shows "no longer available" and the data is gone.

**Acceptance Scenarios**:

1. **Given** a link shared from this browser, **When** the sharer chooses to delete it and confirms, **Then** the link stops working immediately and the stored data is deleted.
2. **Given** someone else's link, **When** a viewer opens it, **Then** there is no way for them to delete it.

---

### Edge Cases

- **Upload interrupted** (network drop, tab closed): no link is issued and no half-stored game data is left behind. The player can simply try again.
- **Shared game from an older app version**: after a later NauticalBeg release changes how games are stored, an unexpired link from the previous version still opens correctly, or shows a clear "made with an older version and can't be opened" message. It never shows wrong or partial data (constitution Principle III).
- **Shared data tampered with or corrupted** in storage: the viewer sees a clear error. Shared data is treated as untrusted input and can never run code or crash the tab.
- **Viewer's browser can't run the app** (private window, etc.): the existing unsupported-browser message from 016 applies.
- **Storage service is down**: sharing and opening links both fail with a clear "sharing is temporarily unavailable" message. Everything local keeps working.
- **Link opened while the viewer already has a kept save**: opening the link doesn't delete or overwrite the kept save.
- **A shared game is kept**: a viewer may keep a shared game in their own browser like any loaded save (the existing keep feature). That local copy is theirs and isn't bound by the link's expiry.
- **Free-tier limit reached**: sharing is refused with a clear message rather than incurring charges (SC-007).

## Requirements *(mandatory)*

### Functional Requirements

**Sharing**

- **FR-001**: When a save is loaded, the app MUST offer a Share action. It MUST NOT be offered when nothing is loaded.
- **FR-002**: Before any upload, the app MUST show, and require the player to confirm:
  - what will be uploaded (the analysed game state, not the save file)
  - that anyone with the link can view it
  - that it is deleted after 7 days
  - the exact expiry date

  Nothing leaves the device without this confirmation (constitution Principle I opt-in).
- **FR-003**: The shared snapshot MUST contain exactly what the viewer needs to see what the sharer sees, and nothing else:
  - The original file name MUST be excluded.
  - Data the app doesn't display (the raw, not-yet-interpreted save sections) MUST be excluded.
  - Players' in-game or account names in multiplayer saves are **kept** (owner decision, 2026-09-25). The FR-002 confirmation MUST mention that they're included.
- **FR-004**: The upload MUST show progress at least once per second when it takes longer than a second, and MUST be cancellable. A cancelled or failed upload MUST leave no stored data and no working link.
- **FR-005**: On success, the app MUST show the link with a one-click copy action and the exact expiry date and time in the player's local time zone.
- **FR-006**: Each share MUST create a new, independent link with its own 7-day expiry. Existing links MUST NOT be extended, renewed or modified.
- **FR-007**: A link MUST be unguessable, and knowing one link MUST NOT make any other link easier to find. Shared games MUST NOT be listed, indexed or discoverable anywhere; the link is the only way in.

**Opening**

- **FR-008**: Opening a valid link MUST load the shared game with the existing load-progress feedback and show every tab, map and map mode with the same data the sharer saw.
- **FR-009**: While a shared game is open, the app MUST show that it is shared and when it expires, in place of the local file name.
- **FR-010**: Opening a link MUST NOT delete, overwrite or alter any save the viewer has kept locally.
- **FR-011**: Expired, deleted and never-existing links MUST each show a plain, distinct message with a way to load one's own save. They MUST NOT show a generic error or a blank page.
- **FR-012**: Shared data MUST be treated as untrusted input. Malformed or tampered data MUST produce a clear error and MUST never execute code or crash the tab.
- **FR-013**: A shared game MUST record the app/format version it was made with. Opening one from an incompatible version MUST fail with a clear message, never show partial or wrong data (constitution Principle III).

**Expiry, limits and privacy**

- **FR-014**: Every link MUST stop working exactly 7 days after creation. The stored game data MUST be deleted within 24 hours after that.
- **FR-015**: Shares above a size cap MUST be refused before upload, with the size and the limit shown. The cap is set during planning from the measured size of a real large save (the real 85MB `MP_RUS_1657` save MUST fit).
- **FR-016**: Share attempts MUST be rate-limited per visitor, with a clear "try again in about N minutes" message when the limit is hit.
- **FR-017**: The sharer MUST be able to delete a link early from the browser that created it, after confirming. Deletion MUST take effect immediately. No one else can delete it.
- **FR-018**: The server side MUST keep no logs or analytics containing game data, and no record of who shared or viewed what, beyond what rate limiting strictly needs for its time window.
- **FR-019**: What is stored, for how long and why MUST be documented in the security constitution (per the constitution's Technical Constraints), and summarised in plain words on the site.
- **FR-020**: If the free-tier storage or request allowance is about to be exceeded, new shares MUST be refused with a clear message rather than incurring charges.

### Key Entities

- **Shared snapshot**: a copy of one loaded game's analysed state, prepared for sharing. It has an unguessable link ID, a creation time, an expiry time (creation + 7 days), a format/app version, and a size. It is immutable once created.
- **Share link**: the public URL that opens one snapshot. One snapshot has exactly one link.
- **Delete key**: a secret held only in the sharer's browser that proves the right to delete that one snapshot early (US4). It is never shown in the link.
- **Rate-limit record**: a short-lived per-visitor counter that expires with its time window and holds no game data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sharing the real `MP_RUS_1657` game takes a player under 1 minute on a 20 Mbps upload connection, from clicking Share to having the link copied.
- **SC-002**: A first-time viewer on a 50 Mbps connection sees the shared game's Overview in no more time than loading the original save file themselves on the same machine.
- **SC-003**: For the real `MP_RUS_1657` game, the in-game date, player nation, Overview headline figures and five sampled map modes are identical between the sharer's session and a viewer's session, with zero differences.
- **SC-004**: 100% of links stop working at 7 days. None of their stored data remains 24 hours after expiry, checked with a shortened test expiry.
- **SC-005**: No shared snapshot contains the original file name or the uninterpreted raw save sections, confirmed by inspecting a stored snapshot.
- **SC-006**: Every refusal (too large, rate-limited, expired, not found, deleted, service down, incompatible version) shows a distinct plain-language message. Zero show a generic error or blank page.
- **SC-007**: Monthly hosting cost stays at $0 at beta traffic, up to at least 1,000 shares a month.

## Assumptions

- **Storage**: the same provider as the site (Cloudflare object storage plus a small serverless function), deployed by the existing 016 pipeline. The plan decides the specifics, including the size cap.
- **Access**: anyone with a link can view. There are no accounts, logins or view restrictions. That's consistent with "no cloud accounts" in the constitution.
- **Read-only**: viewers can explore everything but can't change the shared game (the app is read-only anyway).
- **The deletion right lives only in the sharer's browser.** Clearing browser data or switching device loses the ability to delete early; the 7-day expiry still applies.
- **Scope**: link sharing only. A downloadable snapshot file, view-state links ("open on this map mode, this country"), and link previews/thumbnails for chat apps are out of scope, possible later.
- **Test-only expiry**: a shortened expiry is available only for testing, never in production.
- **The constitution needs a small amendment or clarification**. Principle I and Technical Constraints already allow server-side retention with opt-in and documentation. The security constitution sections on trust boundaries (§1), data isolation (§3), secrets (§4), integrations (§6), logging (§7) and incident response (§8) need updating, because the project gains its first server component.
