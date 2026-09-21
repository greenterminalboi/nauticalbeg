# Research: World Goods Production Share

## 1. Confirmed against the real save inventory (`tools/schema-mapping/inventories/Russia (Melted).json`)

`provinces.database.*.last_month_produced` is a real, populated
`variable_object` field (3295 of 4071 provinces in the reference save
have it), keyed by good name, each value a plain number — a province's
production of that good over the last recorded month.

Its key vocabulary is a strict subset of `market_manager.produced_goods`'s
71 goods: **52 overlap** (clay, lumber, fish, wheat, millet, sand,
marble, iron, copper, silver, horses, wool, medicaments, livestock,
stone, wild_game, fur, beeswax, fiber_crops, legumes, ivory, goods_gold,
coal, tin, wine, gems, fruit, salt, lead, saffron, alum, incense, amber,
elephants, cotton, silk, sugar, pepper, dyes, saltpeter, rice, pearls,
olives, mercury, coffee, tea, cloves, maize, cocoa, chili, tobacco,
potato — raw-material/RGO outputs), and **19 goods appear only in
`produced_goods`, never in `last_month_produced`**: beer, books,
cannons, cloth, fine_cloth, firearms, furniture, glass, jewelry,
leather, liquor, masonry, naval_supplies, paper, pottery, slaves_goods,
tar, tools, weaponry — manufactured/building outputs, confirming the
spec's Assumption that these need `building_manager` (not `provinces`)
to attribute per-country, and are out of scope here.

`provinces` already carries `owner_idx` in this app's schema (from
`007`/earlier work), so a province's current owner is already a solved
join — no new owner lookup needed.

**The test fixture already has this data.** `tests/fixtures/rus-1628-minimal.eu5`'s
two province entries (idx 0 and 16777289) both carry real
`last_month_produced` blocks — added incidentally when the fixture's
provinces were first written, unused until this feature. Province 0:
`clay`, `lumber`, `fish`, `wheat`, `millet`. Province 16777289: `amber`,
`wool`, `livestock`, `fruit`. All four of the fixture's existing
`market_manager.produced_goods` entries (clay, wool, amber, lumber)
happen to already have coverage — one new `produced_goods` entry with
no matching `last_month_produced` key is needed to exercise the
no-coverage branch in tests.

## 2. Decisions

**Decision: a good's production-share coverage is derived dynamically
(a `LEFT JOIN`/`EXISTS` against `province_good_production`'s real
contents), never a hardcoded list of the 52 covered goods.** Rationale:
self-describing from what the save actually contains — if a future save
version adds `last_month_produced` coverage for a currently-manufactured
good, this app picks it up with zero code changes; a hardcoded list
would silently go stale. Alternatives considered: a committed TS
`Set<string>` of the 52 keys (this app's `categories.ts` precedent for
Encyclopedia) — rejected because that precedent is for genuinely
static, game-file-sourced data; coverage here is a save-data fact, not
a game-definition fact, so it belongs in the query layer.

**Decision: `province_good_production` uses `province_idx INTEGER`
(matching `provinces.idx`'s existing type), no `BIGINT`.** Same
resolved-question precedent as `007`'s `markets.idx`: province indices
already fit `INTEGER` everywhere else in this schema (`provinces.idx`,
`locations.province_idx`), so there's no reason to widen here.

**Decision: unattributed production (no real-country owner) is computed
client-side, reusing `loadLeaderboardCountries`'s existing
`country_type = 'Real'`-filtered country list, exactly mirroring
`LeaderboardTab.tsx`'s existing "join selected countries, bucket
everyone/everything else as Other" pattern.** The new query,
`listGoodProductionByOwnerArrow(db, good)`, groups purely by
`provinces.owner_idx` (which can be `NULL` for unowned provinces) with
no join to `nations` at all; `WorldGoodsPage.tsx` then looks each
`owner_idx` up in the already-available Real-countries list — any
`owner_idx` that's `NULL`, or belongs to a non-Real country type
(Pirates, a rebel faction, etc.), falls through to one combined
"Unattributed" bucket, the same shape as Leaderboard's "Other."
Rationale: reuses a proven pattern and an existing query
(`loadLeaderboardCountries`) instead of writing a new SQL join with its
own `COALESCE`/`country_type` filtering logic. Alternatives considered:
a single SQL query joining `nations` and filtering `country_type =
'Real'` server-side — rejected, duplicates logic `loadLeaderboardCountries`
already owns and loses the clean "matches an existing pattern exactly"
property.

**Decision: reuse `LeaderboardTreemap.tsx` for this feature's treemap,
renamed to `ShareTreemap.tsx`.** The component already takes only
`title` and `entries: {id, label, color, value}[]` — nothing
Leaderboard-specific lives inside it. Now that two unrelated features
(country wealth share, and country good-production share) both need
"a treemap of named, colored, valued entries," keeping the
Leaderboard-specific name would actively mislead a future reader.
Mechanical rename: the file, its `.css`, its test file, and
`LeaderboardTab.tsx`'s one import. No behavior change.
Alternatives considered: leave the name as-is and just import it from a
different feature — rejected, the misleading name is a real,
compounding readability cost for a one-time mechanical fix; write a
near-duplicate `GoodProductionTreemap.tsx` instead — rejected as
needless duplication of an already-generic component (Principle VII).

**Decision: World Goods becomes a switchable page inside `MarketsTab`,
mirroring `LeaderboardTab.tsx`'s exact `activeView` state + `VIEWS`
button-group toggle** (not a new top-level Factbook nav entry — per the
user's own framing, "its own page under the Markets tab"). `MarketsTab`
gains `activeView: "worldGoods" | "markets"`, a small button group
identical in shape to `.leaderboard-tab__view-toggle`, and renders
either the new `WorldGoodsPage` or the existing Markets-list-and-drill-down
block (unchanged internally) based on it.

**Decision: legibility at scale (FR-009) caps individually-shown real
countries at 15, folding the rest into one further "Other producers"
bucket, distinct from "Unattributed."** A common good (grain, fish) can
have dozens of real producing countries; 15 keeps every major producer
visible without degenerating into illegibly tiny slivers, matching this
app's general "usable at full scale" bar (spec's own FR-009 wording).
Kept as a separate bucket from "Unattributed" (no real owner) rather
than merged, so a viewer can tell "many small real countries" apart
from "no real owner" at a glance — collapsing both into one bucket
would answer a different, less useful question. Alternatives
considered: no cap at all — rejected, fails FR-009 outright for common
goods; merge into the existing Unattributed bucket — rejected, loses a
real distinction a viewer would want.

**Decision: the World Goods grid's coverage marker and the page-level
gating both read one column, `has_production_coverage`, added directly
to `listWorldGoodsArrow`'s existing SQL** (via a `LEFT JOIN` against
`SELECT DISTINCT good FROM province_good_production`), rather than a
second query. `marketData.ts`'s `decodeWorldGoods` parses it into
`WorldGood.hasProductionCoverage: boolean`, so both
`WorldGoodsOverview`'s grid column and `WorldGoodsPage`'s
covered-vs-not-covered branch read the same already-loaded field — one
round trip, one source of truth, no risk of the grid's marker and the
page's gating logic disagreeing.
