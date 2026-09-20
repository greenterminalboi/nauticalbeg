# EU5 Save Schema Summary: Managers & Top-Level Sections

A curated, human-readable map of every top-level section in an EU5 save
file — what each one is for, and a real example drawn from actually
running `tools/schema-mapping/generate.ts` against a real ~642MB save
(`Russia (Melted).eu5`, game version 1.3.11; see
`specs/004-full-schema-mapping/`). This is a companion to the tool's own
generated inventory (which is exhaustive but per-field, and gitignored —
research.md §6 explains why); this file is the narrative version:
grouped by theme, one entry per section, with only what's actually been
observed. Regenerate the raw inventory yourself with:

```bash
npm run schema-map -- inventory --save <path-to-.eu5> --markdown
```

**A recurring pattern worth knowing up front**: many `_manager` sections
store their records in a `database` field keyed by a large, sparse
numeric ID space (entity indices, not sequential array indices — see
`wars`/`population`'s own `BIGINT` findings in `schema.sql`). Most ID
slots in that space are unused and hold the literal string `"none"`
rather than a real record; only a minority are real objects. Confirmed
directly for `war_manager` (56 database entries, 47 of them `"none"`,
9 real wars) and observed as the same shape in several other managers
below — called out per-section only where it hasn't been directly
confirmed against real data the way `war_manager` has.

---

## Session & Meta

- **`metadata`** — Save-level identity: `version` (game version, e.g.
  `"1.3.11"`), `date` (current in-game date), `playthrough_id`/
  `playthrough_name`, `save_label` (e.g. `"1628.8.14 - Russia"`),
  `player_country_name`, the player's flag/coat-of-arms definition, and
  `enabled_dlcs`. The one section every adapter checks for before
  trusting a file is a real save (`src/parser/version-adapters/1.3.11.ts`).
- **`start_of_day` / `current_age` / `speed` / `random_seed` /
  `random_count`** — single scalar values (a date, an age/era id, the
  game-speed setting, and the RNG's seed/draw-count). No nested structure.
- **`variables`** — free-form scripted state: `data` (flag/value pairs
  set by game scripts), `list` (named lists like `"pope_countries"`),
  `map_data` (named key→value maps). This is the game's own scripting
  "global variable store," not app-specific config.
- **`ironman_manager`** — `date` (when ironman mode last checked in) and
  `storage` (e.g. `"local"`).
- **`game_rules` / `prev_game_rules`** — the ruleset chosen at game
  start (`setting`, a flat list like
  `["player_normal_difficulty", "ai_normal_difficulty", ...]`) and the
  previous session's rules for comparison; `prev_game_rules` had 30
  samples in this save (one per rule-string entry, not per session).
- **`counters`** — ~55 named integer counters tracking how many times
  various game events have fired this campaign (e.g. `Tick`, `Day`,
  `LocationOwnerChanged: 69180`, `WarNeverChanges: 18037`). Diagnostic/
  engine bookkeeping, not player-facing data.
- **`tasks`** — scheduler bookkeeping for the game's internal periodic
  jobs, keyed by job name (e.g. `"999_AIEconomyMonthly"`), each holding
  when it last ran (`last`) and sometimes a working list
  (`sorted_countries`).
- **`coat_of_arms_manager`** — just `next_id`, the next id to hand out
  for a newly generated coat of arms.
- **`playing_past_end_date` / `first_start` / `played_in_multiplayer` /
  `start_oos_resync`** — single boolean/scalar session flags.
- **`previous_played`** — 20 samples in this save; a small history list,
  shape not otherwise characterized in this pass.
- **`played_country`** — NOT a nested object: a *repeating top-level
  key* (274 occurrences in this save), one entry per human-controlled
  country recorded over the campaign's history (matches
  `schema.sql`'s existing note: "a handful of real top-level keys
  repeat, e.g. `played_country`, once per human player" — the adapter
  already handles this specially rather than treating it as one section).
- **`cheats`** — `cheat_type`, empty in this save (no cheats used).
- **`tutorial_manager`** — just `active: false` in this save.

## Nations, Court & Diplomacy

- **`countries`** — the nation registry Encyclopedia's Countries tab is
  built on (`schema.sql`'s `nations` table). Two numeric-ID-keyed
  collections at its root: `tags` (idx → tag string, e.g. `"RUS"`,
  `"DUMMY"` for unused slots) and `database` (idx → full country
  record — government, stability, treasury, etc.; see
  `research-save-format.md` for the full field list already promoted
  into `nations`). 6,274 total field paths make this the second-largest
  section in the save after `market_manager`.
- **`diplomacy_manager`** — every bilateral diplomatic relationship and
  action in the game, as ~13 named lists of `{first, second, ...}`
  pairs: `dependency` (vassalage/subject relationships), `royal_marriage`,
  `casus_belli`, `annex`, `economic_support`, `opinion_improvement`,
  `war_reparations`, `annul_treaties`, `create_casus_belli`,
  `building_spy_network`, and scripted relation types. 2,470 sampled
  entries — this is the section whose mixed numeric+named-key shape
  originally motivated `NUMERIC_KEY_RATIO_THRESHOLD` in `classify.ts`.
- **`great_power_manager`** — `members` (list of great powers with the
  date each attained the status) and `hegemons` (current economic/
  naval/military hegemon per category, each with a `start_date`).
- **`international_organization_manager`** — 191 field paths;
  `destroy_ios` (dissolution events with a structured `reason`) is the
  only field seen at shallow depth — the organizations themselves live
  deeper (leadership, members, votes) and weren't characterized in this
  pass.
- **`imperialcircle_manager`** — 7 field paths, shape not characterized
  in this pass (likely a `database`-style ID-keyed collection like most
  other managers here).
- **`colony_manager`** — `claims` (province-name-keyed map of
  colonization claims, e.g. `{"vasterbotten_province": {"owner": 3,
  "reason": "treaty_of_noteborg"}}`).
- **`estate_manager` / `bureaucracy_manager` / `cabinet_manager` /
  `rulerterm_manager` / `dynasty_manager`** — per-country court/
  administration systems. `bureaucracy_manager.database.*` is a real
  per-slot record (`date`, `object` (the bureaucracy building type,
  e.g. `"central_secretariat_bureaucracy"`), `country`, `maintenance`/
  `new_maintenance`, `entrenchment`); `cabinet_manager.database.*` holds
  per-advisor-slot state (`character` id, `societal_values` axis,
  `locked`, `implemented_government_action.date`). `estate_manager` and
  `dynasty_manager` showed only the sparse ID-slot pattern in this pass
  (real records exist but weren't sampled at shallow depth).
- **`character_db`** — every character in the game (rulers, heirs,
  advisors, generals — not just the player's). Only `portraits_version`
  (currently `2`) sits at the top; the actual per-character records live
  under `database.*` (107 total field paths), which this pass only
  confirmed follows the same sparse-ID-slot shape, not the record fields
  themselves.
- **`cardinals`** — one record per cardinal: `location`, `religion`,
  `owner` (which country currently controls/influences them).
- **`institution_manager`** — `institutions`, keyed by institution name
  (e.g. `"feudalism"`, `"legalism"`, `"meritocracy"`) with `active` and
  `origin` (the location/country of origin).
- **`culture_manager`** — one real record per culture (not the sparse-
  slot pattern — 15 of 16 fields were populated in this save's sample):
  `name`/`culture_definition`, `size`, `color` (RGB), `language`,
  `cultural_influence`/`cultural_tradition`, income stats, and opinion
  lists (`our_opinion`, `other_opinion`).
- **`religion_manager`** — 489 field paths, the largest of the "court &
  diplomacy" group. `schools` (religious school relationships, e.g.
  `"ibadi_school"` → `{"relation": {"zaidi_school": "kindred"}}`), `map`
  (religion-name → numeric id lookup table, e.g. `"bon": 0`,
  `"mahayana": 1`), and `unique_names` (a flat id list).
- **`holy_site_manager`** — one record per holy site: `type` (e.g.
  `"city"`), `location`, `importance`, `name_key`, `religions` (which
  religions recognize it), `god`/`avatar`.
- **`work_of_art_manager`** — `quality`, a single running score; the
  per-artwork records (10 field paths total) weren't characterized
  further in this pass.

## Map & Territory

- **`provinces`** — the coarse province layer (`schema.sql`'s
  `provinces` table: name, owner, capital location). Sparse-ID-slot
  `database` pattern, same as most managers here.
- **`locations`** — the fine-grained map-tile layer (`schema.sql`'s
  `locations` table) and the *authoritative* source for
  ownership/development (per `research-save-format.md`). Real per-tile
  records: `owner`/`controller`/`previous_owner`, `market`/
  `second_best_market` + access/attraction scores, `cores`/
  `scripted_cores`, `religion`/`religious_unity`. 618 field paths,
  69 distinct fields per location sampled.
- **`road_network`** — `roads`, a flat list of `{from, to, type}` edges
  (e.g. `"gravel_road"`) connecting locations.
- **`terra_incognita`** — `countries.*` is a list keyed oddly (e.g.
  `[0, 28573]` for one entry) — likely per-country terra-incognita
  progress/reveal state; not fully characterized in this pass.
- **`weather`** — 25 field paths, sparse-ID-slot pattern; not further
  characterized.
- **`resolution_manager`** — 25 field paths, sparse-ID-slot pattern
  (likely map-resolution/rendering-related bookkeeping, not confirmed).
- **`townrights_manager`** — 3 field paths, sparse-ID-slot pattern.

## Population & Economy

- **`population`** — every population group in the game (`schema.sql`'s
  `population` table — 215,197 real rows at full scale, per the earlier
  User Story 2 promotion work). `needed` (per-pop-group trade-good
  demand) was the only field visible at shallow depth here; the
  per-pop-group scalar fields (`pop_type`, `estate`, `culture`,
  `religion`, `status`, `size`, `literacy`, `satisfaction`, `owner`) are
  already fully documented in `schema.sql`'s own comment.
- **`market_manager`** — the single largest section in the save: 3,413
  field paths. `produced_goods` (a trade-good-name-keyed map of total
  production, e.g. `"horses": 4789.7`, `"iron": 13162.7`) is the only
  field visible at shallow depth; the per-market records driving
  Encyclopedia's planned Markets tab live deeper and weren't
  characterized in this pass.
- **`trade_manager` / `trade_path_manager`** — trade-route bookkeeping;
  both showed only the sparse-ID-slot pattern in this pass.
- **`building_manager`** — the largest real (non-sparse) per-record
  collection found: 284 distinct fields sampled per building. Each
  record has `type` (e.g. `"brewery"`), `level`, `employed`, `location`,
  `owner`, `last_months_profit`, `establishment_progress`, `upkeep`, and
  building-type-specific maintenance-goods-demand fields (e.g.
  `millet_brewery_maintenance.missing.demand`).
- **`construction_manager` / `loan_manager` / `disaster_manager`** —
  sparse-ID-slot pattern; not further characterized (construction queue,
  active loans, and disaster events, respectively, by name).
- **`work_of_art_manager`** — see Nations/Court group above (artwork
  quality tracking).
- **`migration_manager` / `exploration_manager`** — population migration
  and map-exploration progress. `exploration_manager.spread` is a real
  list of `{country, date, area}` — which country explored which sea
  zone/area and when.
- **`colony_manager`** — see Nations/Court group above.

## Military & War

- **`war_manager`** — every war ever fought (`schema.sql`'s `wars`
  table — see this feature's own §6/§7 research notes for the full,
  directly-confirmed shape: `database.*` holds `all` (per-participant
  join/leave history with dates, scores, and losses),
  `original_attacker`/`original_defenders`, `war_name`, `start_date`/
  `end_date`, `attacker_score`/`defender_score`, `attacker_losses`/
  `defender_losses`, and a `locations` map of contested tiles). `names`
  is a sibling of `database`: a lookup list of war-name *templates*
  (e.g. `"AGRESSION_WAR_NAME"`, with an `override_adj` for
  region-specific phrasing) that `war_name.name` keys reference — the
  Wars tab surfaces the raw key rather than resolving this template,
  per constitution Principle IV (no access to the game's localization
  strings). 56 database entries in this save, 47 unused (`"none"`), 9
  real wars.
- **`combat_manager` / `siege_manager`** — active/historical battle and
  siege state; sparse-ID-slot pattern in this pass (real battle records
  do exist — `war_manager.database.*.battle` already showed a detailed
  per-battle record with location/date/result/per-side losses when
  inspecting a specific war directly).
- **`subunit_manager` / `unit_manager` / `unit_template_manager`** —
  the military unit hierarchy (subunit = individual regiment/ship,
  unit = the higher-level formation, unit_template = the
  composition/loadout blueprint units are built from). All three showed
  only the sparse-ID-slot pattern in this pass.
- **`mercenary_manager`** — `pool`, keyed by mercenary type (e.g.
  `"Army"`), each entry holding `ticking_manpower_pool` and
  `leaders_v2`.
- **`rebel_manager`** — active rebellion state; sparse-ID-slot pattern.
- **`military_objective` / `strategic_military_objective` /
  `diplomatic_objective`** — each is mostly just a `count` (a running
  objective/achievement counter, e.g. `military_objective.count:
  1391951`) plus a handful of other fields not characterized here.
- **`naval_transport_manager`** — sparse-ID-slot pattern.
- **`maritime_manager`** — real per-sea-zone records under `objects.*`:
  `population` (e.g. of a coastal/naval population), `presences` (which
  countries have naval presence there and how much `power`), `privateer`
  activity.
- **`privateer_manager`** — `pirate_harassment`, keyed by sea-zone-area
  name, tracking harassment totals over time.
- **`prisoner_manager` / `dynamic_game_object_manager`** — both had
  zero samples in this save (empty/unused this campaign) — shape
  entirely unconfirmed.

## World Events & Systems

- **`situation_manager`** — the game's scripted "world event" system:
  one entry per named historical/dynamic event (e.g.
  `"black_death"`, `"hundred_years_war"`, `"reformation"`,
  `"rise_of_the_ottomans"`), each with `status` (`"active"` /
  `"after"`), `start`/`end` dates, and sometimes `voters` or `variables`.
  Events that haven't triggered yet in this save show as `{}` (e.g.
  `"columbian_exchange"`, `"the_revolution"`).
- **`disease_outbreak_manager`** — `data`, a list of outbreak records by
  disease type (e.g. `"bubonic_plague"`) with affected locations and
  per-pop resistance state.
- **`movement_outbreak_manager`** — real per-outbreak records (e.g. a
  religious movement): `parameter` (movement type + origin location),
  `outbreak_date`, `locations`/`locations_ever_affected` (flat
  location-id/intensity pairs), `sub_units_affected`, `religion`/
  `culture`, and `timed_modifiers`.
- **`event_manager`** — `triggered_event` (fired scripted events with
  full scope/target context) and `next_player_event_id` (the next id to
  assign).
- **`advance_manager`** — the tech/tradition tree, one field per age
  (`age_1_traditions` through `age_6_revolutions`), each a nested
  `ref`/`children` tree of unlockable nodes.
- **`periphora`** — 1 field path, sparse-ID-slot pattern; purpose not
  identified from name/shape alone in this pass.
- **`language_manager`** — `top` (a running score/id) and `power`
  (language-name-keyed map of global speaker-share, e.g.
  `"arabic_language": 0.437`).
