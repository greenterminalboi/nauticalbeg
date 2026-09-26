# Sharing & privacy

NauticalBeg normally reads your save entirely in your browser; nothing is
uploaded. **Sharing is the one exception, and it only happens when you click
Share and confirm.** This page says exactly what gets stored, for how long,
and why.

## What is uploaded

When you share, NauticalBeg uploads the **analysed game data** your browser
built from your save: the tables behind every tab and map mode, such as
nations, provinces, markets, wars, rulers and diplomacy.

- **Not uploaded**: your save file itself, its file name, and the raw parts
  of the save NauticalBeg doesn't display.
- **Included**: players' names in multiplayer games, because the game data
  contains them. The Share dialog says so before you confirm.
- The data is compressed (a very large late-game multiplayer save comes to
  about 13MB) and stored as a single object.

## Who can see it

**Anyone with the link.** Links are long and random, so they can't be guessed,
and shared games aren't listed or searchable anywhere. If you post a link
publicly, treat it as public.

## How long it's kept

- A link works for **exactly 7 days** from when it was made. After that it
  shows "This shared game has expired."
- The stored data is deleted automatically **within 24 hours after that**.
- Links can't be extended. Sharing again makes a new, separate 7-day link.
- **Deleting early**: the browser you shared from remembers each link's
  delete key (stored in that browser only). The Share dialog lists your
  unexpired links with a Delete button. Deleting takes effect immediately;
  the link then says the game was taken down. If you clear your browser data
  or switch devices, you lose the ability to delete early, and the 7-day
  expiry still applies.

## What is *not* kept

- No accounts, no logins, no analytics, no tracking cookies.
- No logs of who shared or viewed what.
- **Rate limiting** (at most 5 shares an hour per visitor) needs to recognise
  repeat visitors, so it stores a salted, one-way hash of your IP address for
  one hour, together with a count. Your IP address itself is never stored.
- A daily total of uploaded bytes (no per-visitor data) keeps storage inside
  the free tier.

## Why

So you can show a friend or a forum your game without them needing your save
file or running anything. The 7-day limit keeps storage small and free, and
makes sure nothing you share lingers.

## Where it lives

Cloudflare R2 object storage, reached through the site's own
`/api/shares` endpoints (Cloudflare Pages Functions, in `functions/`). The
viewer's browser downloads the snapshot and rebuilds the game locally.
Nothing is processed on the server.

---

## For maintainers

### One-time setup (Cloudflare dashboard)

1. **Enable R2**: Storage & databases → R2 → complete the (free)
   subscription checkout. It asks for a payment method, but beta use stays
   inside the free tier.
2. **Buckets**: create `nauticalbeg-shares` (production) and
   `nauticalbeg-shares-preview` (pull-request previews).
3. **Lifecycle rule** on both: delete objects 7 days after upload.
4. **KV**: create namespaces `SHARE_LIMITS` and `SHARE_LIMITS_PREVIEW`, and
   put their IDs in `wrangler.toml` (IDs aren't secret).
5. **Secret**: Pages project → Settings → Variables and Secrets → add
   `RATE_LIMIT_SALT` (any long random string) for Production **and** Preview.
   Never commit it.

The existing deploy token ("Cloudflare Pages: Edit") deploys the Functions
and their bindings; it needs nothing extra.

### Limits (in `functions/api/shares/_lib/limits.ts`)

| Limit | Value | Why |
|---|---|---|
| Upload size | 40 MiB compressed | 3× the largest real save measured (13MB); under the free plan's 100MB body limit |
| Per visitor | 5 shares / hour | abuse |
| Daily budget | 1.3GB of new shares / day | ×7 days ≈ 9.1GB live, under R2's free 10GB |

### Testing expiry on a preview

Set `SHARE_TTL_SECONDS` to e.g. `120` in `wrangler.toml`'s `[env.preview.vars]`
on a branch, and open a PR. Its preview's links expire after 2 minutes.
**Never lower it in production.**

### Local development

`npm run build && npx wrangler pages dev dist` runs the site with the
Functions and simulated R2/KV (data kept under `.wrangler/`).
