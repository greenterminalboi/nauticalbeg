# Contract: `/api/shares` (Cloudflare Pages Functions, same origin)

Bindings: `SHARES` (R2), `SHARE_LIMITS` (KV), `RATE_LIMIT_SALT` (secret), `SHARE_TTL_SECONDS` (var; `604800` in production, may be lowered in preview only).

Every error body is JSON `{ "error": <code>, "message": <plain text>, ...extra }`. The app maps each `error` code to its message in `share-ui.md`.

## POST /api/shares — create a share

Request:
- Body: the `brotli(container)` bytes.
- `Content-Length`: required.
- `X-Snapshot-Format`: `1`.
- `X-Uncompressed-Length`: the container's byte length.

Checks, in order:

| # | Check | Failure |
|---|---|---|
| 1 | `Content-Length` present and ≤ 41,943,040 | `413 {error:"too_large", limitBytes}` |
| 2 | `X-Snapshot-Format` is a known version | `400 {error:"bad_request"}` |
| 3 | visitor's hourly count < 5 | `429 {error:"rate_limited", retryAfterSeconds}` + `Retry-After` |
| 4 | today's bytes + `Content-Length` ≤ 1.3GB | `503 {error:"busy"}` |
| 5 | stream the body to R2 `shares/<new id>` with metadata | `500 {error:"unavailable"}` (nothing stored) |

After a successful write, increment both KV counters. KV write failures are logged nowhere and don't fail the share.

Response `201`:

```json
{ "id": "<30 chars>", "url": "https://nauticalbeg.pages.dev/s/<id>", "expiresAt": "<ISO>", "deleteKey": "<base64url 32 bytes>" }
```

The body is streamed to R2 and never read or parsed by the Function (the 10ms CPU limit). An aborted upload leaves no object, because R2 `put` only commits a complete body.

## GET /api/shares/:id — download

| Situation | Response |
|---|---|
| id fails `^[A-Za-z0-9_-]{30}$` | `404 {error:"not_found"}` |
| object exists and `now - createdAt < TTL` | `200`, the body streamed as-is, `Content-Encoding: br` (manual encoding, not re-compressed), `Content-Type: application/octet-stream`, `X-Uncompressed-Length`, `X-Expires-At`, `Cache-Control: private, no-store` |
| object exists and has expired | `410 {error:"expired"}` (and the object is deleted) |
| `tombstones/<id>` exists | `410 {error:"deleted"}` |
| neither exists, and the ID's embedded time is older than TTL | `410 {error:"expired"}` |
| neither exists otherwise | `404 {error:"not_found"}` |

`no-store` means an expired or deleted share can never be served from a cache.

## DELETE /api/shares/:id — delete early

Request: `Authorization: Bearer <deleteKey>`.

| Situation | Response |
|---|---|
| the key's SHA-256 matches `deleteKeyHash` (constant-time compare) | delete `shares/<id>`, write `tombstones/<id>`, return `204` |
| wrong or missing key | `403 {error:"forbidden"}` |
| no such active share | `404 {error:"not_found"}` |

## Not provided

No listing, no search, no update/extend endpoint (FR-006, FR-007). No request logging of bodies, IDs or IPs (FR-018).
