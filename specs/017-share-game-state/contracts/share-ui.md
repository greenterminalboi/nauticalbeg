# Contract: share UI

## Share button (TopBar)

- Shown only when a save is loaded and the session is **not** itself a shared game.
- It opens `ShareDialog`, a modal with focus trapped inside. Esc closes it except during upload, where Esc means Cancel.

## ShareDialog states

1. **Confirm**. The text says roughly:
   > "Share this game? NauticalBeg will upload the analysed game data (not your save file) so anyone with the link can view it. **Player names in multiplayer games are included.** The link and data are deleted on **{date, time, local}** (7 days). You can't extend it, but you can share again for a new link."

   Buttons: **Share** and **Cancel**. Nothing is uploaded before Share is clicked (FR-002).
2. **Too large** (checked before upload): "This game is {X} MB compressed; the sharing limit is 40 MB." There's no upload.
3. **Working**, with phases: *Preparing data → Compressing → Uploading {n}%*. The indicator updates at least once a second. **Cancel** aborts the request, and nothing is stored.
4. **Done**: the link in a read-only field, a **Copy link** button ("Copied" confirmation), "Expires {date, time}", and **Delete this link** (asks to confirm inline; no browser `confirm()` dialogs).
5. **Error**, mapped from the API codes:

| Code | Message |
|---|---|
| `rate_limited` | "You've shared a lot recently — try again in about {n} minutes." |
| `busy` | "Sharing is at capacity for today — try again tomorrow." |
| `too_large` | Same as state 2. |
| `unavailable` / network | "Sharing is temporarily unavailable. Your game is unaffected." |

## Opening `/s/<id>`

- On startup, `FileLoader` sees `/s/<id>`. It doesn't offer the kept-save resume; it imports the share instead, with the normal progress UI (*Downloading → Loading shared game*).
- Afterwards the URL stays `/s/<id>`, so reloading re-opens the share.
- If the viewer loads their own save, the app replaces the URL with `/` (history.replaceState) and the shared game is closed like any superseded save.
- A kept local save is never touched (FR-010).

## Shared-mode top bar (FR-009)

The loaded-file label reads **"Shared game · expires {date}"**, not a file name. The Keep toggle stays available: a viewer may keep a local copy.

## `SharedLinkMessage` (FR-011, SC-006)

Each message has a distinct title, one sentence, and a "Load your own save" pointer to the file picker.

| Case | Title | Body |
|---|---|---|
| expired | This shared game has expired | Shared links last 7 days. |
| deleted | This shared game was taken down | The person who shared it deleted the link. |
| not found | This shared game wasn't found | Check the link was copied completely. |
| unavailable | Sharing is temporarily unavailable | Try again in a little while. |
| incompatible | Made with a different version of NauticalBeg | This link can't be opened by this version. |
| corrupt | This shared game couldn't be read | The shared data is damaged. |
