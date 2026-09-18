# EU5 Save Format — Confirmed Structure

Derived from direct inspection of a real, 653MB, uncompressed ("melted")
EU5 save file (version `1.3.11`, multiplayer, 274 human players, dated
1628.8.14). This is a reference for whoever writes the parser
(`src/parser/version-adapters/`) — every field path below was confirmed by
grep/sed against the real file, not guessed. Line numbers refer to that
source file (`/Users/halda/Projects/PyHelpersForPDXWikis/output/eu5/saves/melted.eu5`,
not committed — it's 653MB) and will differ in other saves; they're cited
as evidence, not as a stable offset.

A minimized, syntactically-valid fixture built **only from these
confirmed real field names and real values** lives at
`tests/fixtures/rus-1628-minimal.eu5` (4.2KB). See the "Fixture
composition method" section at the bottom for exactly how it was derived.

## File shape

- Plain ASCII text, Clausewitz key-value syntax: `key=value`, `key={ ... }`,
  nested arbitrarily deep. Tab-indented.
- First line is a header/magic string before any `{`, e.g.
  `SAV02009ce65dcc0004e3d100000000` — no `metadata=` wrapper around it.
- No comment syntax observed anywhere in the file (no `#` lines) — don't
  assume the parser needs to skip comments.
- Numbers are plain decimals (including negative, e.g.
  `karma=-11.40825`); no scientific notation observed.
- 40,220,828 lines total in the source file.

## Top-level keys (confirmed present, in file order)

`metadata`, `variables`, `language_manager`, `ironman_manager`,
`great_power_manager`, `road_network`, `resolution_manager`,
`situation_manager`, `dynamic_game_object_manager`,
`institution_manager`, `loan_manager`, `construction_manager`,
`tutorial_manager`, `culture_manager`, `holy_site_manager`, `periphora`,
`dynasty_manager`, `character_db`, `religion_manager`, `work_of_art_manager`,
`rulerterm_manager`, `cabinet_manager`, `estate_manager`,
`bureaucracy_manager`, **`countries`**, `market_manager`,
`disaster_manager`, `building_manager`, **`population`**,
`subunit_manager`, `unit_manager`, **`provinces`**, `townrights_manager`,
`trade_path_manager`, `trade_manager`, `mercenary_manager`,
`prisoner_manager`, `imperialcircle_manager`,
`international_organization_manager`, `weather`, `exploration_manager`,
`migration_manager`, `privateer_manager`, `maritime_manager`,
`colony_manager`, `diplomacy_manager`, **`war_manager`**,
`siege_manager`, `combat_manager`, `rebel_manager`, `terra_incognita`,
`military_objective`, `strategic_military_objective`,
`diplomatic_objective`, `cardinals`, `cheats`, **`locations`**,
`disease_outbreak_manager`, `movement_outbreak_manager`,
`naval_transport_manager`, `advance_manager`, `event_manager`,
`unit_template_manager`, then **274 repeated `played_country={...}`
blocks** (one per human player in this multiplayer save).

Bolded ones are what this feature's parser actually needs. The rest exist
and are large but out of scope for the overview feature.

## `metadata` (lines 2–126)

Direct, easy fields:
- `date="1628.8.14"` — the save's single in-game date (`YYYY.M.D`, no
  zero-padding observed).
- `player_country_name="Russia"` — a **localized display string**, not a
  tag or index. See "Open question: identifying the player's country"
  below — this is the biggest unresolved piece.
- `version="1.3.11"` — game version string, suitable for FR-004 version
  detection.
- `multiplayer=yes|no`.
- `compatibility.locations={ <space-separated tile id list> }` — a huge
  (28k+ entries) flat token list used for save-compatibility checking. Not
  needed for parsing gameplay data; the fixture truncates this away
  entirely (single-player saves will have the same key, just possibly
  smaller).

## `countries` (starts line 3,319,609 in the source file)

Two sub-keys:

- **`tags={ <numeric_index>=<3-letter tag> ... }`** — e.g. `2025=RUS`,
  `3=SCA`, `0=DUMMY`. This numeric index (not the tag string) is the key
  used everywhere else in the file to reference a country (province
  `owner`, location `owner`, war participant `country`, etc.).
- **`database={ <same numeric_index>={ ... } ... }`** — the actual
  per-country record. 2,467 entries have `country_type=Real`; a handful
  have `country_type=Pirates` or `Mercenaries` (index `0` = `DUMMY`,
  `country_type=Pirates`, is one of these placeholder/non-real entries —
  don't surface it as a real nation).

Confirmed fields on a real country record (RUS, index 2025, line
~5,662,231):
- `country_name={ name="RUS" key={ "Adjective"="RUS_ADJ" } }` — this is a
  **localization key structure, not a display name** (`name` here is
  literally the tag again). Use `metadata.player_country_name` for the
  human-readable display name instead.
- `government.type="monarchy"` — **nested** under `government`, not a
  top-level field like the original data-model.md assumed.
- `currency_data.gold` — treasury. Real value seen: `5493.12008`.
- `currency_data.stability` — exists, but **not** an EU4-style small
  bounded number. Sampled ~30 real countries' values: mostly continuous
  floats roughly in the range **-25 to +55** in this save (dummy/pirate
  placeholder entries sit near `0.00199`). Exact intended display
  range/scale (is it a percentage? unbounded accumulator? clamped
  somewhere?) is **not confirmed** — treat it as an opaque raw number for
  v1 and don't assume a fixed min/max without further research.
- `country_type` — `"Real"` for actual nations; other values
  (`"Pirates"`, `"Mercenaries"`) mark non-player-relevant entries the
  parser should filter out when picking "the player's nation."

## `provinces` (starts line 16,999,260)

- `database={ <numeric_index>={ ... } ... }` — 3,296 entries.
- Confirmed fields: `capital=<location_index>`,
  `province_definition="mazyr_province"` (a real historical-province
  name, used for display), `owner=<numeric_index_into_countries>`,
  plus food/production economic fields not needed for this feature.
- **No `development` field exists on a province entry.** This is the key
  finding that invalidated the original data-model.md assumption.

## `locations` (starts line 33,446,439 — NOT the same as
`metadata.compatibility.locations`, which is just a flat tag list)

- `locations={ locations={ <numeric_index>={ ... } ... } }` (the key is
  doubled: top-level `locations` object's only real content is another
  `locations` sub-key). 28,573 entries — these are individual map tiles,
  finer-grained than `provinces`.
- **`development` lives here**, per location (confirmed real values:
  `28.83884`, `46.90152`).
- `owner=<numeric_index_into_countries>` — a location's owner can in
  principle differ from its containing province's owner during contested
  control; for v1, treat location-level owner as authoritative for
  "what does this country currently hold" (it's the finer-grained, more
  current signal).
- `province=<numeric_index_into_provinces>` — back-reference to the
  containing province. Cross-checked and consistent (location `3975`'s
  `province=16777289` matches province `16777289`'s own record).

**Total development / province count for a nation (FR-006/FR-007)**:
compute by summing `locations.locations[i].development` and counting
matching `i`, filtered by `locations.locations[i].owner == <country's
numeric index>` — NOT by summing anything on `provinces`. "Province
count" as named in the spec is really closer to "location count" in
EU5's model; this is a naming nuance worth flagging to product/spec, not
silently reinterpreting — see Deviations below.

## `war_manager` (starts line 32,959,522)

- `database={ <war_id>={ all={ { country=<idx>, status=<...> , all_history={...} } ... }, start_date=..., war_name={...} } }`.
- Confirmed `status` values: `"Active"` and `"Declined"` (a country that
  was asked to join but refused). There are very likely other historical
  statuses for concluded participation, not confirmed here.
- No `end_date` field was found on the one active war inspected
  (`start_date=1627.12.13`, still ongoing at the save's 1628.8.14 date) —
  the presence/absence of `end_date` is a plausible secondary signal for
  "is this war still ongoing," but the primary, country-scoped signal is:
  **a country is at war if it appears in any
  `war_manager.database[*].all[*]` entry with matching `country` and
  `status="Active"`.**

## `terra_incognita.countries` (the second "countries=" match)

This is a **different, unrelated structure** — fog-of-war/exploration
data per country (`terra_incognita.countries={ <country_idx>={ <flat
list of location-id/reveal-amount pairs> } }`), nested under
`terra_incognita`, not the real country registry. Not needed for this
feature.

## `played_country` (274 repeated top-level blocks in this save)

Each has `name` (the human player's username), `country=<numeric_index>`,
`player_proficiency`, etc. This is the authoritative list of
human-controlled countries in a save — directly relevant to the spec's
existing "multiplayer save with more than one human-controlled nation"
edge case, which is very real (this save has 274).

## Open question: identifying "the player's nation" precisely

`metadata.player_country_name="Russia"` is a **localized display
string**. There is no direct tag or numeric-index field next to it in
metadata linking it to a `countries.database` entry. Two ways to resolve
this were considered, neither fully confirmed:

1. **Match by played_country + assume single-perspective context**: for
   a true single-player save (not this multiplayer sample), there should
   be exactly one `played_country` entry, and its `country` index is
   unambiguously "the player." This is likely the easy, common case.
2. **For multiplayer saves** (like this fixture's source), there is no
   field indicating *which* of the 274 `played_country` entries
   corresponds to "the exporting client's own perspective" —
   `player_country_name` seems to encode that, but resolving the English
   display name "Russia" back to tag "RUS" requires a name→tag table this
   save does not contain (that mapping lives in the game's own
   localization files, external to any save).

**Recommendation for the parser**: implement case 1 (single
`played_country` entry ⇒ unambiguous) as the primary path, matching the
spec's existing Assumption ("v1 shows the overview for a single primary
nation... the first human-controlled nation found"). For multiple
`played_country` entries, fall back to that same "first entry" rule
exactly as the spec assumption already states, and treat
`player_country_name` as a display-only hint rather than a lookup key.
This doesn't require new spec work — it's just confirming the existing
Assumption is implementable as written, with the caveat that in a
multiplayer save "first found" may not match `player_country_name`
exactly (e.g., "first" might not literally be "Russia" here) — that's
already an accepted tradeoff per the spec's own wording, not a new gap.

## Counts observed (this save, for scale reference)

- 2,467 `country_type=Real` countries (2,470 total entries incl.
  Pirates/Mercenaries placeholders).
- 3,296 provinces.
- 28,573 locations.
- 274 `played_country` (human player) entries.

## Deviations from the original data-model.md assumptions

1. Countries and provinces are **not** keyed by tag/name directly — both
   require an index-lookup via `countries.tags`.
2. `government_type` is nested (`government.type`), not top-level.
3. `treasury` is `currency_data.gold`; `stability` is
   `currency_data.stability` with an unconfirmed non-EU4-like scale.
4. **Development lives on locations, not provinces** — the schema needs a
   `locations` table; `provinces` alone can't answer FR-006/FR-007's
   development/province-count stats.
5. War status requires cross-referencing `war_manager`, not a flag on the
   country record itself.

`data-model.md` has been updated to reflect all of the above.

## Fixture composition method (for `tests/fixtures/rus-1628-minimal.eu5`)

Rather than a raw byte-range slice of the 653MB file (individual real
records ran 5–190KB each, mostly deeply-nested history/character/economy
detail irrelevant to this feature), the fixture is a **hand-assembled
composition of real field names and real values**, each copied verbatim
from a specific, confirmed location in the source file, then reassembled
into small, syntactically-valid, self-contained blocks. Nothing in it is
invented — every key and value was verified present in the real save
before inclusion. What's in it, and its real source line (for
traceability/re-verification against the source file if needed):

- Header line: source line 1.
- `metadata`: hand-composed from real lines 2 (`multiplayer`), 4
  (`date`), 5–7 (`playthrough_id`/`playthrough_name`/`save_label`), 8
  (`version`), 56 (`player_country_name`) — the huge flag/emblem/
  compatibility-locations content in between was omitted.
- `countries.tags`: 5 of the real 2,470 entries (indices 0, 1, 2, 3, 2025)
  from the real tags table (~line 3,319,610 onward).
- `countries.database[0]` (DUMMY): copied **in full and verbatim** — this
  one was small enough (108 lines, 3.8KB, source line 3,322,083) to
  include completely rather than trim.
- `countries.database[3]` (SCA): `country_name`, `country_type`, full
  `currency_data` block, and the first 6 lines of `government` (through
  `heir`) copied verbatim from source lines ~3,322,421+; the much larger
  `parliament`/cabinet/estate detail was omitted.
- `countries.database[2025]` (RUS): same treatment, verbatim
  `currency_data` and top of `government`, from source line 5,662,231+.
- `provinces.database[0]` ("uppland_province", owned by index 3): copied
  in full verbatim (23 lines, source line 16,999,262).
- `provinces.database[16777289]` ("mazyr_province", owned by RUS/2025):
  copied in full verbatim (25 lines, source line 17,001,067) — this
  province's `capital=3975` matches the location fixture below.
- `locations.locations[1]` (owned by index 3, `development=46.90152`,
  `province=0`): top-level scalar fields only, verbatim values, source
  line 33,446,441 — nested `population`/`estate_tax` detail omitted.
- `locations.locations[3975]` (owned by RUS/2025, `development=28.83884`,
  `province=16777289`): same treatment, verbatim values, source line
  34,672,491. Confirms the location→province back-reference is
  consistent with the province fixture above.
- `war_manager.database[2030043139]`: trimmed to 2 of its real
  participants (`country=2025 status=Active`, `country=220
  status=Declined`) and `start_date`, from source line 33,258,161 — the
  much larger per-participant combat-loss history was omitted.
- `played_country`: one real entry (source line 40,212,878) included to
  document the multiplayer player-roster shape.
- `cheats={ cheat_type={ } }`: copied in full verbatim (source line
  33,446,436) — a small, real, unrecognized top-level section used to
  test the `raw_sections` catch-all (see "Capturing everything" below)
  without guessing at a section this project hasn't researched.

## Capturing everything, not just these 5 sections

After initial implementation, the decision was made to have the adapter
capture **every** top-level section (not just the 5 above) so future
features don't lose data the save actually contains — sections without a
real table are stored as opaque JSON in a `raw_sections` catch-all rather
than guessed-at columns. See `data-model.md`'s `raw_sections` entry and
`ARCHITECTURE.md`'s "Capturing sections we don't understand yet" for the
full rationale and accepted tradeoffs (more parse time/storage now,
revisit if too slow). This doesn't change anything documented above about
the 5 researched sections — it only means the ~45 other sections listed
in "Top-level keys" are no longer silently discarded.

If a future adapter needs more structural coverage than this fixture
provides (e.g. a full `government.parliament` block, or economy/estate
detail), extend the fixture the same way: find the real value in a real
save first, copy it verbatim, don't invent it.

## Save format parsing: switched to `jomini`

The adapter now parses with [`jomini`](https://www.npmjs.com/package/jomini)
(MIT, WASM) rather than a hand-rolled tokenizer. This was found by
comparing this project's approach against an existing open-source Paradox
save-parsing toolkit (`PyHelpersForPDXWikis`), which uses `rakaly`/`jomini`
(the same author's tooling) via a Rust CLI subprocess — not usable
directly in a browser, but its underlying `jomini` crate is separately
published as a browser-ready WASM npm package.

Two real parsing bugs were found and fixed in the original hand-rolled
tokenizer by testing against the actual 653MB save (not just the
minimized fixture) before this switch — both are handled natively by
`jomini` without any special-casing needed:
- A literal `"=="` used as a dictionary key in a character
  name-popularity counter (renders as `===0` with no whitespace).
- An object used as a map key inside `building_manager`
  (`{demand=pop_demand}={...}`).

**Verified against the complete real 653MB file** (not a slice — reading
it as raw bytes rather than a decoded string avoids Node's V8
string-length ceiling, which is what limited earlier stress-testing to
partial slices): parses successfully end-to-end in ~17 seconds, correctly
detecting version `1.3.11`, date `1628.8.14`, and a real player nation.

One `jomini`-specific gotcha: its `typeNarrowing` option auto-narrows
date-shaped values to `Date` objects, which misfires on the quoted
version string `"1.3.11"` (mistaken for a date). Using `typeNarrowing:
"unquoted"` avoids this — see `ARCHITECTURE.md` for the full explanation.
