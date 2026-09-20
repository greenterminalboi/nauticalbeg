# Research: Game Encyclopedia

## §8. The game already has its own "Europedia" — use it as a labeling/priority signal, and be honest about description limits

**Discovery** (prompted mid-research: "there should be a europedia of some
sorts in the game files"): the game ships its own in-game encyclopedia,
and its own name for it is literally **"Europedia"**
(`main_menu/localization/english/encyclopedia_l_english.yml`:
`HEADING_ENCYCLOPEDIA: "Europedia"`). That file lists 40 official
`ENCYCLOPEDIA_PAGE_*` entries (Buildings, Goods, Government Types,
Traits, Religion Groups, Urban Rights, and so on) with the game's own
display label for each — a curated, authoritative "this is player-
facing" signal, and the game's own wording, which is better than one
this project would invent. Separately, `main_menu/common/game_concepts/
00_game_concepts.txt` (3,404 lines) plus `game_concepts_l_english.yml`
(2,633 lines) is the game's own hand-written mechanics glossary — real
prose explaining terms like "Modifier," "Location Modifier," etc., each
with a `<key>` name and `<key>_desc` description — genuinely the closest
thing to "good information on game mechanics and how everything works"
(the user's own framing for this feature) that the game's files contain
anywhere.

**Decision**: `categories.ts` (research.md §3) uses the official
`ENCYCLOPEDIA_PAGE_*` list as a labeling and confidence signal, not as
a hard inclusion filter: a category matching an official page uses the
game's own page label as its `CategoryMeta.label`, and is treated as
unambiguously player-facing. A category with no official page (e.g.
`goods_demand`, `production_methods`, `prices`, `building_categories`)
is not automatically excluded — several are exactly what the upcoming
Production, Trade & Markets feature needs — but its inclusion/exclusion
call in `categories.ts` is made without that authoritative signal to
lean on, so it gets a clearer written reason either way. `game_concepts`
is included as its own category, explicitly under Government & Society
(closest fit among the five domain groups — this feature's Assumptions
already treat exact category-to-group assignment as a planning detail),
and its entries carry real localized descriptions rather than the
sparser `fields`-only content typical elsewhere in the catalog.

**Found and fixed during implementation**: `game_concepts` entries are
localized under a `game_concept_<key>` prefix, not the bare key — e.g.
the definition key `modifier` has no `modifier` localization entry at
all, only `game_concept_modifier: "Modifier"` /
`game_concept_modifier_desc: "..."`. Before this was known,
`write-output.ts`'s plain `localization.get(raw.key)` resolved a name
for only 90 of 696 real `game_concepts` entries (the rest either had no
bare-key match at all, or coincidentally matched an unrelated loc string
sharing that bare word). `lookupLocalization()` now tries the
`game_concept_<key>` prefix first for this one category, falling back
to the bare key — verified against the real install: 696/696 entries
now resolve a real name. This is category-specific, not a general
`_prefix` convention: every other category in the catalog is confirmed
to localize by its bare key.

**A second, important finding**: the Europedia's own descriptions for
several entry types are **not static localization text at all** —
`encyclopedia_l_english.yml` shows entries like
`ENCYCLOPEDIA_BUILDING_ENTRY: "[BUILDING_TYPE.GetEncyclopediaEntryDesc]"`,
a scripted getter the game's engine evaluates at runtime (combining
base text with modifiers, current game state, etc.), not a value that
exists anywhere in the game's files as plain text. Confirmed directly:
an individual building like `academy_of_sciences` has only a display
name in `buildings_l_english.yml` (`academy_of_sciences: "Academy of
Sciences"`), no `_desc` key. This affects Buildings, Unit Categories,
Unit Types, Advances, Ages, and Artists specifically (the six
`ENCYCLOPEDIA_PAGE_*` entries whose companion key is a `GetTooltip`/
`GetUITooltip`/`GetEncyclopediaEntryDesc` getter, not a plain string).

**Rationale**: This project has no game engine to evaluate those
getters against, and there is no static text anywhere in the game's
files to copy instead — inventing one would violate Principle IV
(Accurate, Unembellished Representation) far more seriously than simply
having no description. For these categories, `EncyclopediaEntry.
description` is `null` (the same honest fallback FR-004 already
specifies for a missing name), and the entry's real informational value
comes from its `fields` — data this feature already extracts in full
from the same source `.txt` files. No spec or data-model change is
needed; this is a documented limit on what "description" can mean for
some categories, not a gap in the existing design.

**Alternatives considered**: Attempting to reconstruct the composed
tooltip text by re-implementing the relevant modifier/scope logic
(rejected — a genuinely large undertaking, effectively re-implementing
part of the game engine, wildly out of proportion to this feature's
actual user stories, none of which require byte-identical tooltip
parity). Silently omitting `description` entirely for these categories
rather than exposing it as `null` (rejected — `null` is the same honest,
already-specified fallback used elsewhere; a differently-shaped entry
type for six categories would be inconsistent for no benefit).

## §1. Parsing the game's definition files: reuse `jomini`, don't write a new parser

**Decision**: The generation tool parses `game/in_game/common/<category>/*.txt`
with the same `jomini` package already used for save parsing
(`src/parser/version-adapters/1.3.11.ts`), calling
`(await Jomini.initialize()).parseText(text, { typeNarrowing: "unquoted" })`
against each file's UTF-8 text content.

**Rationale**: EU5's save files and its definition/script files (goods,
buildings, production methods, etc.) both use Clausewitz script syntax —
confirmed directly by inspecting real definition files (e.g.
`game/in_game/common/goods/00_raw_materials.txt`): nested `key = { ... }`
blocks, `key = value` pairs, comments with `#`. `jomini`'s `parseText` is
already a dependency and already proven against this project's real
save data at scale. Writing a second bespoke parser for what is
structurally the same grammar would violate Principle VII (Simplicity)
for no benefit.

**Alternatives considered**: A hand-rolled regex/line parser (rejected —
Clausewitz script has nested blocks and quoted strings with escapes;
`jomini` already handles this correctly and is battle-tested against
this project's real 600MB+ save). A different WASM/native Clausewitz
parser library (rejected — no reason to add a second dependency for the
same grammar `jomini` already parses).

**Confirmed empirically during implementation**: `jomini`'s `parseText`
is very lenient — an unclosed brace or a stray `=` does **not** throw;
it recovers and returns a best-effort tree. It reliably throws only on
a genuine tokenizer failure, confirmed with an unterminated quoted
string (`"unexpected end of file"`). FR-013's "skip and record a file
that fails to parse" is therefore a real but narrower safety net than
it might sound: most malformed real-world files won't trigger it (they
parse "successfully" into a wrong-shaped tree instead), so
`parse-definitions.ts` wraps each file's `parseText` call in try/catch
for the genuine-throw case, and downstream code (write-output.ts) must
still tolerate an entry whose fields don't look like a normal record
(FR-013 doesn't require detecting every malformed file, only never
letting one abort the run).

## §2. Localization: a dedicated line-based merge, not a generic YAML library

**Decision**: Write a small dedicated parser for Paradox's localization
`.yml` files (`tools/encyclopedia-scraping/parse-localization.ts`) that
reads every file under `game/main_menu/localization/english/` (and any
other `localization/english/` directories the game ships), skips the
`l_english:` header line, and extracts `key: "value"` pairs by regex,
merged into one global key → text map. Keys with a `_desc` suffix are
treated as that key's description; the bare key is its display name.

**Rationale**: Paradox's localization format resembles YAML but isn't
strict YAML (a BOM-prefixed `l_english:` header, unquoted leading
whitespace, embedded scripted macros like
`[ShowBuildingTypeName('...')]` inside string values that a generic YAML
parser has no reason to understand or need to). Confirmed directly
against real files (`game/main_menu/localization/english/
buildings_l_english.yml`). Localization keys are **not** filename-scoped
to their category (a `goods_l_english.yml` file exists, but building
names live in `buildings_l_english.yml`, prices have no dedicated file
at all) — so lookup must be by a single global merged key → text map,
never "the loc file matching this category's name."

**Alternatives considered**: A generic YAML library (rejected — the
format isn't valid YAML in the strict sense and a generic parser buys
nothing over a targeted regex for this narrow, well-understood shape).
Per-category localization file matching (rejected — confirmed false by
inspection; keys are globally namespaced, not file-scoped).

## §3. Category → domain group mapping and the exclusion list

**Decision**: `tools/encyclopedia-scraping/categories.ts` is a single
committed source-of-truth table mapping every folder name under
`game/in_game/common/` to one of the five domain groups, or to an
explicit `excluded: true` entry with a one-line reason (e.g. purely
AI-scoring or script-internal categories with no player-facing meaning).
Generation reads this table rather than inferring grouping from folder
names at runtime.

**Rationale**: Spec FR-007 requires every category to be accounted for,
never silently dropped — a committed, reviewable table is the only way
to guarantee that (a runtime heuristic could silently miscategorize or
skip a new category after a game update without anyone noticing). This
table is also exactly where a future game update's new/renamed
categories get triaged: `generate.ts` should warn (not fail) when it
finds a category folder absent from this table, per the spec's edge
case ("a future base-game update... must be handled by re-running
generation").

**Implementation note**: `generate.ts`'s own parsing loop iterates
`CATEGORY_ASSIGNMENTS`, not the install's actual directory listing, so
it can only ever process categories already known to the table — it
cannot by itself notice a brand-new folder. `warnOnUnlistedCategories`
is a separate, explicit check (run once per generation) that scans
`in_game/common/`'s real directory listing and warns on any folder
absent from the table, closing that gap. Verified against the real
local install: zero unlisted categories, confirming `categories.ts`'s
124-folder table is currently complete.

**Alternatives considered**: Inferring domain group from category name
patterns (rejected — too many categories don't map obviously, e.g.
`age`, `avatars`, `hegemons`; an explicit table is unambiguous and
reviewable, matching the "smallest thing that works" bias toward a
committed lookup table over a clever heuristic).

## §4. Storage and delivery: static JSON assets, not the per-save DuckDB pipeline

**Decision**: Generated output is static JSON under `public/encyclopedia/`
— one file per category, a `search-index.json` carrying only
`{category, key, name}` rows for every entry (for FR-009's global
search), and a `manifest.json` recording domain-group membership, entry
counts, and the Generation Run's game version + installed DLCs. The
running app fetches these like `public/map/*.topojson` is already
fetched — on demand, cached in memory, never recomputed client-side.

**Rationale**: `src/storage/schema.sql`'s own header states it is "one
database per save" — Encyclopedia content is explicitly *not*
save-scoped (`FileLoader.tsx` renders the Encyclopedia section
unconditionally, with or without a loaded save), so bolting it onto the
per-save DuckDB schema would misrepresent its lifecycle and complicate
every query that currently assumes "the active save's database."
Per-category JSON fetched on demand keeps the initial payload small
(only the search index loads eagerly) and mirrors an already-proven
pattern in this codebase rather than introducing a second storage
engine.

**Alternatives considered**: One giant JSON/TS file for all ~124
categories (rejected — unnecessarily loads categories a user never
opens; `rgoGameColors.ts`'s single-file pattern works at 52 entries, not
at an estimated several thousand). A dedicated static DuckDB/SQLite
database bundled as an asset (rejected — adds a second query engine for
data that's fundamentally just "fetch this category's entries and
filter/search in memory," which plain JSON already does with no new
dependency; revisit only if a future feature needs relational queries
across Encyclopedia data that in-memory filtering can't satisfy).

## §5. Icons: excluded from v1 entirely, not "resolved locally"

**Decision**: v1 of this feature ships **no icons at all** — entries
render as text/data only. FR-011's "resolved only from the user's own
local game installation at runtime" is *not* implemented in this
feature; that would require the browser's File System Access API (an
explicit per-session user grant to a local directory), which is a
distinct, non-trivial UX flow with its own edge cases, and no part of
this spec's user stories depends on icons being visible to deliver
value.

**Rationale**: The constitution's ban on shipping icon assets is a hard
constraint (verified directly: `find` across the local game install
confirms per-category `.dds` icon folders exist and are keyed
consistently to entry internal keys, e.g. `icon_goods_horses.dds` — so
they *could* be resolved by key, but not shipped). Building the local-
grant flow now would be scope creep relative to the spec's actual user
stories (lookup, browse, cross-reference, search), none of which
require icons to be satisfied. Deferring it keeps FR-011 satisfied
trivially (zero icon files shipped) while leaving the door open.

**Alternatives considered**: Implementing local icon resolution now via
File System Access API (rejected for v1 — real added complexity and UX
surface with no user story requiring it; candidate for a follow-up
feature). Generating placeholder/generic icons per category (rejected —
would misrepresent the game's actual visual design as this app's own
invention, arguably worse than no icon).

## §6. DLC detection and labeling

**Decision**: The generation tool's `--install <path>` argument is the
game root (matching `tools/map-generation`'s existing `--install`
convention); it scans `<install>/dlc/*` for installed DLC folders
(confirmed present locally: `D000_shared`, `D008_fate_of_the_phoenix`,
`D015_ancient_monuments_pack`, `D017_sacred_sites_pack`) the same way it
scans `<install>/in_game/common`, merging their `common/` definition
files and localization on top of the base game's, and tagging every
entry with which of the two it came from (base game, or the specific
DLC folder name) before writing output.

**Rationale**: Directly satisfies FR-010. `D000_shared` is bundled/free
content that ships with the base game rather than a purchasable DLC in
the ordinary sense — it is still technically under `dlc/`, so it is
included and labeled like any other DLC folder rather than special-
cased; a reader can tell it apart from a paid DLC by its folder name in
the Generation Run record if that distinction ever matters.

**Alternatives considered**: Treating `D000_shared` as base-game content
(rejected — it lives under `dlc/` in the actual install; labeling by
where content is physically found is simpler and more honest than
guessing at Paradox's internal packaging intent).

## §7. Cross-references: match by internal key at generation time, not at render time

**Decision**: `resolve-cross-refs.ts` runs once, after all categories are
parsed, scanning each entry's fields for values that exactly match
another entry's `category::key` (or a small set of known reference
field names per category, e.g. a building's `category` field, a
production method's good-input keys) and records the match directly in
that entry's stored data — the UI renders a pre-resolved link, it does
not re-derive cross-references at render time.

**Rationale**: Resolving at generation time (not render time) means a
broken/missing reference (spec edge case: target excluded or DLC-only
and absent) is known and handled once, centrally, rather than by every
UI surface that happens to render that field. It also keeps the shipped
per-category JSON self-describing (a consumer of `buildings.json`
doesn't need every other category loaded just to know whether its
`category` field is a valid link).

**Alternatives considered**: Resolving links at render time by fetching
the referenced category on demand (rejected — more complex, and
requires the UI to handle "is this key a real cross-reference" logic
that generation already has all the information to settle once).

**Refined during implementation**: matching is a plain global
key → `(category, key)` lookup (not a per-category known-field-name
list — that would need bespoke logic per category, against Principle
VII), run against **every** category `parse-definitions.ts` parses,
*including* excluded ones — not only the categories that get written to
output. This is what makes a genuine `resolved: false` case possible at
all: a field naming an excluded category's key produces an unresolved
`CrossReference` (the target is known to exist, just not browsable), while
a field whose value matches nothing anywhere (e.g. it names a DLC
entry absent from this install) produces no `CrossReference` at all —
there's no way to tell "this meant to reference something now missing"
from "this string was never a reference," so it's left alone rather than
guessed at. A match is only recorded when it is unique (exactly one
category has that key) — an ambiguous match across two categories is
silently skipped rather than guessed, a documented `// simplified:`
ceiling in the code.
