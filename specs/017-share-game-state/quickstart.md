# Quickstart: Share Game State by Link (017)

## Part A: One-time owner setup (Cloudflare dashboard)

Never paste tokens or secrets into chat.

1. **Enable R2**: Storage & databases → R2 → complete the (free) subscription checkout. It asks for a payment method even though beta use stays inside the free tier.
2. **Buckets**: create `nauticalbeg-shares` and `nauticalbeg-shares-preview`.
3. **Lifecycle rule** on both buckets: delete objects **7 days** after upload (applies to `shares/` and `tombstones/`, or simply the whole bucket).
4. **KV**: create namespaces `SHARE_LIMITS` and `SHARE_LIMITS_PREVIEW`. Send Claude both namespace IDs; they aren't secret and go in `wrangler.toml`.
5. **Secret**: Pages project → Settings → Variables and Secrets. Add `RATE_LIMIT_SALT` for both Production and Preview, with any long random string.
6. **Token**: the existing "Cloudflare Pages: Edit" token is enough to deploy Functions with bindings. No change needed.

## Part B: Local validation

| # | Run | Expect |
|---|---|---|
| B1 | `npx vitest run tests/share` | Format round-trip, strict decode errors, IDs/expiry, rate limit and budget math, handler status codes: all pass |
| B2 | Export↔import round-trip on `rus-1628-minimal.eu5` (part of B1) | Every table except `raw_sections` is identical after import. `save_meta.filename` = "Shared game" |
| B3 | `npx wrangler pages dev dist` (local R2/KV simulation) + the app | Share → link → open in another profile → same Overview. Expired (with a shortened TTL), deleted and not-found links each show their message |
| B4 | **Spike**, in the first tasks | In real Chrome under our isolation headers: brotli-wasm compresses; `GET` with `Content-Encoding: br` arrives decompressed; `INSERT … BY NAME` from Arrow works; `/s/<id>` falls back to the app |

## Part C: Hosted validation (preview deploy first, then production)

| # | Scenario | Expect | Spec |
|---|---|---|---|
| C1 | Load `MP_RUS_1657`, click Share, read the dialog | The dialog states what's uploaded, player names, the exact expiry; nothing uploaded yet (check the network panel) | US1, FR-002 |
| C2 | Confirm, then time it until the link is copied | Under 1 minute; progress updates every second; the object is about 13MB | SC-001 |
| C3 | Open the link in a fresh profile | Same date, nation, Overview figures and 5 map modes as the sharer (zero differences); "Shared game · expires …" label | SC-003, FR-009 |
| C4 | Time C3 against loading the `.eu5` itself | The shared open is faster | SC-002 |
| C5 | Inspect the stored object (download, decompress, read the manifest) | No `raw_sections`; filename is "Shared game" | SC-005 |
| C6 | Preview env with `SHARE_TTL_SECONDS=120` | Opens before 2 minutes, "expired" after. The object is gone within 24h of the lifecycle day | SC-004 |
| C7 | Delete from the sharer's browser | "Taken down" message; the object is gone | US4 |
| C8 | Six shares in an hour from one browser | The sixth gets "try again in about N minutes" | FR-016 |
| C9 | A mistyped link, and cancel mid-upload | "Wasn't found"; the cancel leaves no object | FR-011, FR-004 |
| C10 | Open the link while a kept save exists, then reload | The kept save is untouched and still offered after leaving the shared game | FR-010 |
| C11 | First PR of this feature | Preview URL comment appears; a deliberately failing test blocks deploy (closes 016's T027/T031) | 016 |
