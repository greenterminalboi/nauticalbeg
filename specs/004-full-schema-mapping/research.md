# Phase 0 Research: Full Save-File Schema Mapping (Tooling)

## 1. Does jomini work under plain Node (not just the browser Worker/jsdom)?

**Decision**: Yes — confirmed directly, not assumed. This was the one
genuine unknown going into this feature, since this project has
repeatedly found real, environment-specific WASM quirks this session
(DuckDB-Wasm needing distinct Node-native bindings for tests; Perspective
eagerly and incorrectly trying to compile its WASM server merely on
import under Node). `jomini` had never been run outside a browser
Worker or Vitest's `jsdom` environment (which shims `window`/`document`
but still runs on Node underneath) before this feature.

**Verification performed**: A throwaway script run via `npx tsx` (plain
Node, no jsdom, no Vite) called `Jomini.initialize()` and
`parser.parseText()` against the committed fixture directly. It parsed
correctly on the first try — top-level keys, nested objects, and
`typeNarrowing: "unquoted"`'s date-to-`Date` conversion all matched
exactly what the existing browser-Worker adapter produces. No Node-only
shim, polyfill, or special bundler configuration was needed.

**Rationale**: This means `tools/schema-mapping/`'s CLI can call jomini
exactly the same way `src/parser/version-adapters/1.3.11.ts` already
does, with zero new risk surface. No further spike needed.

## 2. jomini's repeated-key normalization applies to the walker too

**Decision**: The inventory walker MUST call jomini's `toArray(obj, key)`
helper (or an equivalent normalization) on every field before
classifying its cardinality — not just at the few call sites the
existing adapter already does this for.

**Rationale**: Confirmed via the same spike: a key that occurs exactly
once in the source (e.g., this fixture's single `played_country` entry)
comes back as a bare object, not a one-element array; the existing
adapter already works around this for the one field it reads
(`toArray(root, "played_country")`). Any field that *could* legitimately
repeat (an entry under a `database={...}` map, a war's `all` participant
list, etc.) needs the same treatment in the walker — otherwise the same
logical field would be misclassified as "sometimes an object, sometimes
an array" (a false type inconsistency) purely because of how many times
it happened to occur in one particular save, rather than because its
real shape changed.

**Alternatives considered**: Classifying "object vs. array of that
object" as two genuinely different observed types — rejected, since this
would flood every inventory with false positives for practically every
repeatable structure in the save, undermining FR-002's "every value type
actually observed" in a way that's actively misleading rather than
rigorous.

## 3. Fixed-shape vs. variable-keyed classification (FR-003)

**Decision**: A nested object's key-set is classified per *field path*,
not per single observed instance, by collecting the set of keys seen
across **every** sampled entry that has that field (full scan, not one
example) and applying a simple, documented rule: if the same small set
of key names recurs across entries (e.g., `currency_data` always has
`gold`, most also have `stability`, etc. — a bounded, named vocabulary),
it's fixed-shape; if the key-set differs substantially entry to entry in
a way that suggests the keys themselves are *data* (e.g., a production
breakdown keyed by whichever trade goods a given province happens to
produce), it's variable-keyed.

**Verification performed**: Spiked against the real fixture data —
`government.estates` (an 8-key, always-identically-named map of estate
type → internal index) is a clean fixed-shape example; `last_month_produced`
(keyed by trade-good name, which varies by province) is the variable-keyed
example already called out in the spec. Confirming *variability*
specifically requires seeing multiple entries with genuinely different
key-sets — a single sampled province can't prove a field is
variable-keyed on its own, which is a second, independent reason (beyond
optionality detection) that this feature scans every entry rather than
sampling.

**Rationale**: A simple, mechanical, per-path rule (rather than a
judgment call per section) keeps this "rigorous" per the user's own
framing — the same rule applies uniformly whether the tool is looking at
`currency_data` or a section nobody has manually researched yet.

**Alternatives considered**: A hand-maintained allowlist of which paths
are "known fixed" vs. "known variable" — rejected; this is exactly the
kind of manual, per-section research this feature exists to replace with
a repeatable, automated process.

## 4. Inventory artifact format

**Decision**: The canonical Save Inventory is a single committed JSON
file (one per inventoried save, under
`tools/schema-mapping/inventories/`), with a Markdown summary generated
*from* that JSON (not hand-maintained separately) for human review.

**Rationale**: User Story 3 (drift detection) needs to diff two
inventories field-by-field and type-by-type — JSON gives an exact,
unambiguous structure to diff programmatically; a hand-authored Markdown
document (like `research-save-format.md`'s existing prose-based
research notes) is comfortable to read but imprecise to diff reliably.
Generating the Markdown summary from the JSON gets both: an exact source
of truth plus a reviewable document, without maintaining two
hand-written artifacts that could drift from each other.

**Alternatives considered**: Markdown as the sole/primary artifact
(rejected — imprecise for programmatic diffing, the feature's own User
Story 3 requirement); a database table of inventory rows (rejected —
adds a storage/schema dependency to a tool whose entire point is running
*before* any schema exists for a given section, and there's no
runtime/UI consumer for it per FR-009).

## 5. Memory footprint of a full-save parse in Node

**Decision**: Accepted as-is, consistent with the existing app's own
documented tradeoff — no new mitigation needed for this feature.

**Rationale**: `src/parser/worker.ts`'s own existing doc comment already
accepts materializing an entire ~500-600MB save as one in-memory jomini
tree for the browser Worker context, noting object-creation (not
tokenizing) dominates parse cost and that a future optimization exists
(jomini's `query.at()`/callback API) if ever needed. This tool runs the
exact same parse, in a plain Node process without a browser tab's
tighter memory ceiling — so it's expected to be less constrained, not
more. If a real run against the ~642MB designated save proves otherwise,
that's a concrete finding for this feature's own implementation phase,
not a speculative concern to design around up front (constitution
Principle VII).

## 6. Real findings from actually running the tool against the designated real save

Per this project's established practice, the walker was run against the
real `Russia (Melted).eu5` (per Clarifications) as part of implementing
User Story 1, not just against the small fixture. This surfaced four
real bugs/gaps the fixture — deliberately small and trimmed — never
exercised. All four are fixed in `tools/schema-mapping/inventory.ts`.

1. **V8's argument-spread stack limit, not recursion depth.** The first
   run crashed with `RangeError: Maximum call stack size exceeded`
   inside the walker. The cause wasn't genuine recursion depth — it was
   `array.push(...hugeArray)`: `locations.locations` alone has 28,573+
   entries, and spreading tens of thousands of arguments into a function
   call blows V8's call-stack-based argument limit. Fixed by replacing
   every `push(...collection)` with a plain `for...of` loop, which has
   no such limit. (A genuine max-recursion-depth guard, `MAX_WALK_DEPTH`,
   was added alongside this for real deeply-nested structures — see the
   doc comment on that constant — but it did not turn out to be what
   caused this particular crash.)
2. **Real save keys aren't always plain integers.** A country's
   `ai_memory.ai_conquer_desires.loc` map mixes integer-looking keys
   ("100") with decimal-looking keys ("0.03388") in the same object. An
   integer-only numeric-key pattern (`/^\d+$/`) missed this entirely,
   causing ~150 individual AI desire-score values per country to each be
   treated as their own named field. Fixed by broadening the pattern to
   `/^-?\d+(\.\d+)?$/`.
3. **A numeric-keyed collection can live at a section's own top level,
   not only under a named sub-key.** `countries.database` and
   `provinces.database` wrap their repeated entries in a `database` key;
   `diplomacy_manager` does not — it *is* the numeric-keyed collection
   directly (`diplomacy_manager={ 0={...} 1={...} ... }`). The walker's
   top-level section handling originally only checked for this shape
   inside nested fields, not at a section's own root, so
   `diplomacy_manager` was walked as a single fixed record with 2,470
   spurious per-country-index fields. Fixed by applying the same
   collection check to a section's own top-level value.
4. **A numeric-keyed collection can have a minority of named keys mixed
   in.** `diplomacy_manager` itself turned out to be exactly this case:
   2,470 numeric per-country keys *plus* 12 named diplomatic
   action-type definitions (`dependency`, `casus_belli`,
   `royal_marriage`, ...) at the same object level. Requiring *every*
   key to be numeric (per finding 3's initial fix) correctly stopped
   misclassifying the whole object as a fixed record, but then failed
   the collection check entirely because of those 12 named keys, right
   back to the same symptom. Fixed by classifying an object as a
   collection when *at least 80%* of its keys are numeric
   (`NUMERIC_KEY_RATIO_THRESHOLD`), and separately walking the leftover
   named keys as their own small record rather than silently dropping
   them.

**A fifth finding changed this feature's own scope, not just its code:**
a full "1-1, everything" inventory of the real ~642MB save produced a
285MB JSON file and a 262MB Markdown summary. FR-004's "reviewable,
version-controlled artifact" framing does not hold at this scale — a
file that size cannot reasonably be committed to git. **Resolution**: the tool's own code and its fixture-based regression
test (`inventory.fixture.test.ts`) remain committed and reviewable
exactly as FR-004 intends — that test already asserts the exact
classification the tool produces for the fixture, so a redundant static
copy of the same computed output adds nothing. Every generated
inventory — real-save or fixture-derived alike — is a local, on-demand
artifact a maintainer generates when needed, never committed.
`tools/schema-mapping/inventories/` is gitignored in full (except
`.gitkeep`, to keep the directory itself present).

After all five fixes, the real save produced 79 sections and 15,133
field paths in ~25-30 seconds — a plausible, non-pathological result
(spot-checked: no remaining section shows evidence of numeric entity IDs
being misclassified as field names), covering sections like
`diplomacy_manager`, `market_manager`, `population`, and `character_db`
that no prior manual research had ever inventoried at all.

## 7. User Story 2's first applied section: `population`

Selected `population` for this feature's first real schema/adapter
promotion, per the spec's own running example (FR-002/SC-001). Real
per-pop-group fields confirmed via the inventory tool: `type`, `estate`,
`culture`, `religion`, `status`, `size`, `literacy`, `satisfaction`,
`owner`, plus a `missing` trade-good deficit map. All but the last are
consistently-typed scalars (or absent — `status`/`satisfaction`/`owner`
are all genuinely optional, confirmed by the inventory's own `presence:
"sometimes"`) and became real `population` table columns; `missing` was
captured as a single JSON text column (`missing_goods`) per FR-006,
since its keys are trade-good names drawn from a large, data-driven
catalog, not a fixed vocabulary of this table's own fields.

**Deferred for this pass, per FR-011** (not because they're
unstructurable, but because a maintainer chose not to promote every
field in one cycle — tasks.md's Notes section documents this as
expected, repeatable scope): `population.database.*.all_levies` (which
military units a pop group has levied — arguably belongs alongside a
future Military tab's `unit_manager` work rather than this pass) and
`population.needed` (a save-wide, not per-pop-group, table of aggregate
per-good demand — a different shape entirely from the per-pop-group
`population` table this pass built, better suited to its own table in a
future pass).

**A sixth real bug found via real-scale verification** (not caught by
the 2-row fixture test, which happened to only include small IDs):
population entity indices in the real save exceed 32-bit `INTEGER`
range (a real insert failure: "value 2147484004.0 can't be cast...
out of range for... INT32"). Every other `idx` column in this schema
(`nations`, `provinces`, `locations`) comfortably fits `INTEGER`;
`population.idx` needed `BIGINT` instead. Confirmed fixed by re-running
the real save's actual parse-and-store path end-to-end: all 215,197 real
population rows inserted successfully, including a real
`missing_goods` JSON value.

## 8. User Story 2's second applied section: `wars` (2026-09-19)

A second, repeatable pass of the same cycle (tasks.md's Notes section
anticipates this — "T013-T019 are written as one repeatable cycle...
repeat them per additional section chosen"), this time promoting
`war_manager.database` into a real `wars` table for Encyclopedia's Wars
tab. Real per-war fields confirmed the same way as `population`:
`war_name.name` (a raw localization key, e.g. `"AGRESSION_WAR_NAME"` —
surfaced as-is per constitution Principle IV, since this project has no
access to the game's actual localization strings), `original_attacker`,
`original_defenders` (a list — only the first is kept as `defender_idx`
for now, a deliberate FR-011-style scope narrowing, not a limitation of
the data itself), `start_date`/`end_date`, `attacker_score`/
`defender_score`, and `attacker_losses`/`defender_losses` (nested
per-unit-type Battle/Attrition/Capture breakdowns, summed by the adapter
into single casualty totals — `sumLosses` returns `null`, never a
fabricated `0`, when a war's `*_losses` field never appeared at all,
distinct from a real recorded zero). `duration_days` is derived
adapter-side from `start_date` to `end_date` (or to the save's own
current date for a still-ongoing war), not a raw save field.

**The exact same `BIGINT` finding as `population`, independently
re-confirmed**: `war_manager.database` entity indices also exceed 32-bit
`INTEGER` range in the real save (a real insert failure: "value
2164260865.0... out of range for... INT32"). `wars.idx` uses `BIGINT`.

**A real finding specific to `war_manager`, not seen in `population`**:
of `war_manager.database`'s 56 real entries in the designated real save,
47 are the literal string `"none"` (unused/inert pre-allocated war-ID
slots), not war objects at all — only 9 are real wars. The adapter's
extraction loop already skips any entry without a valid `start_date`
(a `Date` instance), which correctly excludes every `"none"` slot
without an explicit type check for it — confirmed by re-running the
real save's actual parse-and-store path end-to-end: exactly 9 real wars
inserted, matching a direct inspection of the raw parsed structure.

## 9. Narrative schema summary (`schema-summary.md`)

Added `specs/004-full-schema-mapping/schema-summary.md` (2026-09-19): a
curated, human-readable companion to the tool's own generated
inventory — one entry per top-level section (all 79, grouped by theme),
each with a plain-language summary and a real example, regenerated
directly from a fresh `npm run schema-map` run against the designated
real save rather than hand-recalled from an earlier conversation.
Unlike the raw generated inventory (exhaustive per-field JSON/Markdown,
gitignored per §6 above), this narrative file is committed: it's
maintainer-curated prose, not a specific run's raw output, so it doesn't
carry the same "too large, not meaningfully reviewable" problem — and
it's the kind of at-a-glance reference a future feature (or a future
session picking a new section to promote) benefits from having close
at hand rather than regenerated and re-read from scratch each time.
