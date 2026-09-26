# Data Model: Share Game State by Link (017)

## Snapshot (container, before compression)

See `contracts/snapshot-format.md` for the byte layout.

| Field | Rule |
|---|---|
| magic | exactly `NBSNAP` (6 bytes) |
| formatVersion | u16. `1` for this feature; unknown values are refused (FR-013) |
| manifest.appVersion | the sharer's `__APP_VERSION__`, informational |
| manifest.createdAt | ISO timestamp, set by the sharer, informational (the server's time is authoritative) |
| manifest.summary | `{ inGameDate, playerNationTag }`, for the loading screen |
| manifest.tables[] | `{ name, rows, bytes, columns[] }`, in stream order. **Never** includes `raw_sections` |
| table streams | one Arrow IPC *stream* per table, concatenated. Byte lengths must match the manifest exactly |

**Rules**: `save_meta.filename` is written as `"Shared game"`. Multiplayer player names are kept (owner decision). An empty table is still listed, with `rows: 0`.

## Share object (R2)

| Field | Where | Rule |
|---|---|---|
| key | `shares/<id>` | written once, never overwritten (FR-006) |
| body | object data | `brotli(container)`, at most 40MB (41,943,040 bytes) |
| createdAt | `customMetadata` | server time (ms since epoch). The only authority for expiry |
| deleteKeyHash | `customMetadata` | hex SHA-256 of the delete key; the key itself is never stored |
| uncompressedLength | `customMetadata` | the container's byte length, for download progress |
| formatVersion | `customMetadata` | copied from the request header, informational |

**Tombstone**: `tombstones/<id>`, an empty body with `customMetadata.deletedAt`, written on an early delete.

**Lifecycle rule**: expire `shares/` and `tombstones/` after 7 days.

### Share ID

`base64url( 6-byte big-endian createdAt seconds ‖ 16 random bytes )`, which is 30 characters. Its validity rule is the regex `^[A-Za-z0-9_-]{30}$`. The embedded time is used only to tell "expired" from "not found" once the object is gone.

### States (as seen through `GET /api/shares/<id>`)

```text
          upload ok                 now-createdAt ≥ 7d
 (none) ───────────▶ ACTIVE ──────────────────────────▶ EXPIRED ──(lifecycle ≤24h)──▶ gone (still reported EXPIRED via the ID's timestamp)
                        │
                        │ DELETE with the correct key
                        ▼
                     DELETED (tombstone; reported DELETED until the tombstone expires, then EXPIRED/NOT_FOUND by timestamp)
```

## KV records (`SHARE_LIMITS`)

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `rl:<visitorHash>:<UTC yyyymmddhh>` | count (string int) | 3,600s | at most 5 shares per visitor per hour (FR-016) |
| `bytes:<UTC yyyymmdd>` | total accepted compressed bytes | 2 days | refuse once > 1.3GB/day (FR-020) |

`visitorHash` is the first 16 hex characters of SHA-256(`CF-Connecting-IP` ‖ `RATE_LIMIT_SALT` secret). No raw IP and no share ID is ever stored here (FR-018).

## Client share record (the sharer's `localStorage`)

Key `nauticalbeg.shares`: an array of `{ id, url, expiresAt, deleteKey }`. Entries whose `expiresAt` has passed are pruned on read. This is the only place a delete key lives (US4). All access is wrapped in try/catch; if storage is blocked, sharing still works but early delete isn't offered.

## App state (in memory)

`FileLoader` gains `shared: { id, expiresAt } | null` for the loaded session. It drives the top-bar label (FR-009) and hides Share for a shared session: a viewer re-sharing someone else's snapshot is out of scope.
