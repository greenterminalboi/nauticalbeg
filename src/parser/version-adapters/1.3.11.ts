// Version adapter for EU5 saves with metadata.version "1.3.11". Parses
// the save with `jomini` (MIT-licensed, WASM, ~200MB/s, purpose-built for
// this exact Paradox save format — see
// specs/001-save-import-overview/research-save-format.md for the
// evaluation that led here) and writes the subset this feature needs into
// the save's SQLite database.
//
// Field paths and their meanings are all confirmed against a real save —
// see research-save-format.md. Do not change what's read here without
// re-checking that document (or a newer one for a different version).
//
// `typeNarrowing: "unquoted"` is load-bearing: with the default ("all"),
// jomini's date-detection heuristic misfires on the quoted 3-part version
// string `"1.3.11"` (mistaking it for a date, confirmed against the real
// save) — restricting narrowing to unquoted values avoids that while
// still correctly narrowing the genuinely-unquoted `date=1628.8.14`.
//
// Takes raw bytes (`Uint8Array`), not a decoded string — jomini parses
// bytes directly, which matters beyond performance: V8 has a hard
// string-length ceiling well below a real save's size (confirmed by
// hitting it directly testing against a 653MB real save; see
// save-reader.ts), so decoding to one big JS string first isn't just
// slower, it can fail outright. Bytes avoid that ceiling entirely.
//
// This still materializes every top-level section as one in-memory tree
// (per explicit project direction to capture everything, not just the 5
// sections below, into `raw_sections`), which is real memory to hold at
// once for a 500-600MB save. jomini's own docs note that object creation
// (not tokenizing) is 95-99% of parse cost, and that its `query.at()`/
// callback API can skip building objects for paths not requested — a
// real future optimization if full materialization proves too slow,
// deliberately not done now (matches the "parse everything now, optimize
// later" decision).
import { Jomini, toArray } from "jomini";
import { insertRows, type SaveDatabase } from "../../storage/db";
import type { LoadWarning } from "../protocol";

export interface ParsedSaveSummary {
  inGameDate: string;
  playerNationTag: string;
  /** Non-blocking notices about values the adapter didn't recognize. */
  warnings?: LoadWarning[];
}

// Sections with a real, structured table (see the extraction below).
// Every other top-level key falls into the `raw_sections` catch-all.
const STRUCTURED_KEYS = new Set([
  "metadata",
  "countries",
  "provinces",
  "locations",
  "war_manager",
  "diplomacy_manager",
  "played_country",
  "population",
  "market_manager",
  "rulerterm_manager",
  "character_db",
  "culture_manager",
  "religion_manager",
  "work_of_art_manager",
]);

/** jomini narrows an unquoted date-like token (e.g. `1628.8.14`) to a
 * UTC-midnight `Date`. Converts back to EU5's own "YYYY.M.D" display
 * format (no zero-padding, matching the source save) rather than an ISO
 * timestamp nobody recognizes from the game itself. */
function formatGameDate(value: unknown): string | null {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}.${value.getUTCMonth() + 1}.${value.getUTCDate()}`;
  }
  return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** specs/005-map-visualization research.md §1: a save's own
 * `metadata.compatibility.locations` is a flat, save-embedded array of
 * every location's name, in the same order as that save's own
 * `locations.locations` numeric keys (1-indexed: array position `idx -
 * 1` is location `idx`'s name) — the canonical join key against the
 * generated map geometry's `properties.name`. This array is baked into
 * the save at creation time, so — unlike reading a static game-install
 * file — it stays correct regardless of which game version/DLC set
 * produced the save. Two earlier approaches were tried and rejected
 * first (see research.md §1's full history): a per-location `name`
 * override field (present on ~0.02% of real locations, not usable at
 * all) and a numeric `idx` baked into the map geometry from a game-
 * install file's declaration order (looked promising in aggregate but
 * had confirmed, real misalignments from game-version drift).
 * Returns `[]` — not a partial/guessed list — if the array is missing
 * or malformed (e.g. an older or non-multiplayer-flagged save that may
 * not carry this block); every location's `name` then falls through to
 * `null`, which this feature's map already renders as neutral "no
 * data" (spec FR-009), never a fabricated identifier. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** specs/006-country-leaderboard research.md §1: a Clausewitz flat
 * numeric array literal (`{ 0 0 39.18862 ... }`) parses via jomini as a
 * plain JS array — used for historical_population/historical_tax_base/
 * historical_economical_base. Filters to actual `number` entries only,
 * same defensive posture as `asStringArray`. */
function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

/** specs/005-map-visualization research.md §3: a Clausewitz `rgb { r g b
 * }` color literal parses via jomini as `{ rgb: [r, g, b] }`. Returns
 * null (not a partial/fabricated triple) unless all three components are
 * confirmed numbers, per constitution Principle IV. */
function asRgbOrNull(value: unknown): [number, number, number] | null {
  const rgb = asRecord(value).rgb;
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  const [r, g, b] = rgb;
  return typeof r === "number" && typeof g === "number" && typeof b === "number"
    ? [r, g, b]
    : null;
}

interface CategoryLoss {
  category: string;
  battle: number | null;
  attrition: number | null;
  capture: number | null;
}

/** specs/012-firepower-tab: the per-unit-category breakdown underlying
 * `sumLosses` below, preserved (not just summed away) so Navy Stats can
 * filter to `navy_%`-prefixed categories for damage given/taken
 * (research.md §8). Same `null` (field never appeared) vs. `[]`
 * (present but empty `losses` map, a real confirmed zero) distinction as
 * `sumLosses`. */
function extractLossesByCategory(lossesField: unknown): CategoryLoss[] | null {
  const outer = asRecord(lossesField);
  if (!("losses" in outer)) return null;
  const result: CategoryLoss[] = [];
  for (const [category, unitLosses] of Object.entries(asRecord(outer.losses))) {
    const rec = asRecord(unitLosses);
    result.push({
      category,
      battle: asNumberOrNull(rec.Battle),
      attrition: asNumberOrNull(rec.Attrition),
      capture: asNumberOrNull(rec.Capture),
    });
  }
  return result;
}

/** Sums a war's `attacker_losses`/`defender_losses` field (shape:
 * `{ losses: { <unit_type>: { Battle?, Attrition?, Capture? } } }`) into
 * one total. Returns `null` — not `0` — when the field never appeared
 * at all (unknown, per constitution Principle IV), distinct from a
 * present-but-empty `losses` map, which is a real, confirmed zero.
 * Defined in terms of `extractLossesByCategory` so both stay in sync —
 * this total is unchanged by specs/012-firepower-tab's addition (still
 * the sum across every category), only the underlying data is now also
 * preserved per-category via `war_unit_losses`. */
function sumLosses(lossesField: unknown): number | null {
  const byCategory = extractLossesByCategory(lossesField);
  if (byCategory === null) return null;
  let total = 0;
  for (const c of byCategory) {
    total += (c.battle ?? 0) + (c.attrition ?? 0) + (c.capture ?? 0);
  }
  return total;
}

// Real, reached milestones through this function's own extraction
// passes — not a time estimate (constitution Principle IV forbids
// fabricating one). Equal-weighted, same convention `FileLoader.tsx`'s
// outer `LOADING_STAGE_ORDER` already uses for the 4 top-level phases:
// each milestone is worth 1/N of the "parsing" stage's own progress,
// regardless of that section's real relative cost, since that cost
// varies by save and was never measured. Added once market_manager
// (007) and province_good_production (009) turned "parsing" — previously
// reported once, with no update until the whole function returned —
// into a phase long enough on a real large save that its own static,
// merely-pulsing loading indicator read as stuck.
const PARSE_MILESTONES = [
  "parsed",
  "nations",
  "provinces",
  "locations",
  "wars",
  "population",
  "markets",
  "world-goods",
  "ruler-history",
  "diplomacy",
  "raw-sections",
  "done",
] as const;

export async function parseAndStore(
  db: SaveDatabase,
  saveId: string,
  filename: string,
  data: Uint8Array,
  onProgress?: (percent: number) => void,
): Promise<ParsedSaveSummary> {
  let milestonesReached = 0;
  function reportMilestone(): void {
    milestonesReached += 1;
    onProgress?.(Math.round((milestonesReached / PARSE_MILESTONES.length) * 100));
  }
  // Real sub-progress *within* the milestone about to be reached, for a
  // single insert big enough that waiting for its own milestone would
  // otherwise be one long silent gap — `insertRows`' own chunk callback
  // (db.ts) feeds this a real "rows inserted so far / total" ratio.
  function reportWithinMilestone(fraction: number): void {
    onProgress?.(Math.round(((milestonesReached + fraction) / PARSE_MILESTONES.length) * 100));
  }

  const parser = await Jomini.initialize();
  const root = asRecord(parser.parseText(data, { typeNarrowing: "unquoted" }));
  reportMilestone(); // "parsed"

  const metadata = asRecord(root.metadata);
  const inGameDate = formatGameDate(metadata.date);
  const version = asStringOrNull(metadata.version);
  const playerCountryName = asStringOrNull(metadata.player_country_name);
  // specs/005-map-visualization research.md §1: this save's own
  // location-name ordering, used below to name every location by idx.
  const compatibilityLocations = asStringArray(asRecord(metadata.compatibility).locations);
  if (!inGameDate || !version) {
    throw new Error(
      "metadata.date/metadata.version missing — not a parseable save",
    );
  }

  // The player's nation: per research-save-format.md's recommendation,
  // the first played_country entry (unambiguous for single-player saves,
  // an accepted "first found" approximation for multiplayer per the
  // spec's existing Assumption). toArray normalizes the single-occurrence
  // case (a plain object) to match the multi-occurrence case (jomini
  // already groups repeats into an array on its own).
  toArray(root, "played_country");
  const playedCountryEntries = (
    Array.isArray(root.played_country) ? root.played_country : []
  ).map(asRecord);
  const playerIdx =
    playedCountryEntries.length > 0
      ? asNumberOrNull(playedCountryEntries[0].country)
      : null;
  // specs/006-country-leaderboard research.md §5/§6: every country any
  // human player controls, not just the single `playerIdx` above (which
  // only ever looks at the first played_country entry — a real
  // multiplayer save can have many).
  const humanPlayedIdxs = new Set(
    playedCountryEntries
      .map((e) => asNumberOrNull(e.country))
      .filter((n): n is number => n !== null),
  );

  const countriesSection = asRecord(root.countries);
  const tags = asRecord(countriesSection.tags) as Record<string, string>; // { "2025": "RUS", ... }
  const countryDatabase = asRecord(countriesSection.database);

  const nationRows: Array<
    [
      number,
      string,
      null,
      string | null,
      number,
      number | null,
      number | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number,
      number | null, // manpower
      number | null, // sailors
      number | null, // monthly_manpower
      number | null, // monthly_sailors
      number | null, // army_tradition
      number | null, // navy_tradition
      number | null, // last_months_army_maintenance
      number | null, // last_months_navy_maintenance
      number | null, // primary_culture_idx
    ]
  > = [];
  // specs/006-country-leaderboard research.md §1/§3: one row per
  // (nation, year, metric) — year = 1337 + array index, the campaign's
  // start year derived two independent ways (research.md §3).
  const HISTORY_START_YEAR = 1337;
  const HISTORY_METRICS = [
    ["historical_population", "population"],
    ["historical_tax_base", "tax_base"],
    ["historical_economical_base", "economical_base"],
  ] as const;
  const nationHistoryRows: Array<[number, number, string, number]> = [];
  // specs/010-societal-values-compass research.md: one row per (nation,
  // axis) for every axis currently applicable to that country.
  // government.societal_values is a flat object of named axes; the raw
  // save marks a not-yet-applicable axis with the exact sentinel -999,
  // which is dropped here rather than stored (a missing row IS "not
  // applicable" for every downstream consumer).
  const SOCIETAL_VALUE_NOT_APPLICABLE = -999;
  const societalValueRows: Array<[number, string, number]> = [];
  // specs/012-firepower-tab: one row per (nation, researched advance) —
  // only `=yes` flags, matching nation_societal_values' "no row = not
  // applicable" convention.
  const nationAdvancesRows: Array<[number, string]> = [];
  // specs/012-firepower-tab: government.implemented_reforms/
  // .implemented_privileges are flat lists of {date, days, object} — all
  // entries currently-active (reforms/privileges accumulate, they don't
  // replace). toArray normalizes the single-entry case the same way
  // played_country is normalized above.
  const nationReformsRows: Array<[number, string, string | null]> = [];
  const nationPrivilegesRows: Array<[number, string, string | null]> = [];
  // specs/012-firepower-tab: government.implemented_laws is grouped by
  // law_category (not a flat list) — exactly one active object per
  // category.
  const nationLawsRows: Array<[number, string, string, string | null]> = [];
  for (const [idxStr, tag] of Object.entries(tags)) {
    const record = asRecord(countryDatabase[idxStr]);
    const currencyData = asRecord(record.currency_data);
    const government = asRecord(record.government);
    // specs/005-map-visualization research.md §3: the country's in-game
    // map color, for the Political/Control layers.
    const rgb = asRgbOrNull(record.color);
    const idx = Number(idxStr);
    nationRows.push([
      idx,
      tag,
      null, // name: only the player nation gets one, set via UPDATE below once known
      asStringOrNull(record.country_type),
      0, // is_player: corrected below once played_country is resolved
      asNumberOrNull(currencyData.gold),
      asNumberOrNull(currencyData.stability),
      asStringOrNull(government.type),
      rgb ? rgb[0] : null,
      rgb ? rgb[1] : null,
      rgb ? rgb[2] : null,
      humanPlayedIdxs.has(idx) ? 1 : 0,
      asNumberOrNull(currencyData.manpower),
      asNumberOrNull(currencyData.sailors),
      asNumberOrNull(currencyData.monthly_manpower),
      asNumberOrNull(currencyData.monthly_sailors),
      asNumberOrNull(currencyData.army_tradition),
      asNumberOrNull(currencyData.navy_tradition),
      asNumberOrNull(record.last_months_army_maintenance),
      asNumberOrNull(record.last_months_navy_maintenance),
      asNumberOrNull(record.primary_culture),
    ]);
    for (const [field, metric] of HISTORY_METRICS) {
      const values = asNumberArray(record[field]);
      values.forEach((value, i) => {
        nationHistoryRows.push([idx, HISTORY_START_YEAR + i, metric, value]);
      });
    }
    const societalValues = asRecord(government.societal_values);
    for (const [axis, value] of Object.entries(societalValues)) {
      if (typeof value === "number" && value !== SOCIETAL_VALUE_NOT_APPLICABLE) {
        societalValueRows.push([idx, axis, value]);
      }
    }
    const researchedAdvances = asRecord(record.researched_advances);
    for (const [advance, value] of Object.entries(researchedAdvances)) {
      if (value === true || value === "yes") {
        nationAdvancesRows.push([idx, advance]);
      }
    }
    toArray(government, "implemented_reforms");
    for (const entry of Array.isArray(government.implemented_reforms) ? government.implemented_reforms : []) {
      const reform = asRecord(entry);
      const object = asStringOrNull(reform.object);
      if (object) nationReformsRows.push([idx, object, formatGameDate(reform.date)]);
    }
    toArray(government, "implemented_privileges");
    for (const entry of Array.isArray(government.implemented_privileges) ? government.implemented_privileges : []) {
      const privilege = asRecord(entry);
      const object = asStringOrNull(privilege.object);
      if (object) nationPrivilegesRows.push([idx, object, formatGameDate(privilege.date)]);
    }
    const implementedLaws = asRecord(government.implemented_laws);
    for (const [lawCategory, entry] of Object.entries(implementedLaws)) {
      const law = asRecord(entry);
      const object = asStringOrNull(law.object);
      if (object) nationLawsRows.push([idx, lawCategory, object, formatGameDate(law.date)]);
    }
  }
  await insertRows(
    db,
    "INSERT INTO nations (idx, tag, name, country_type, is_player, treasury, stability, government_type, color_r, color_g, color_b, is_human_played, manpower, sailors, monthly_manpower, monthly_sailors, army_tradition, navy_tradition, last_months_army_maintenance, last_months_navy_maintenance, primary_culture_idx) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
    nationRows,
  );
  if (nationAdvancesRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_advances (nation_idx, advance) VALUES (?1, ?2)",
      nationAdvancesRows,
    );
  }
  if (nationReformsRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_reforms (nation_idx, object, date) VALUES (?1, ?2, ?3)",
      nationReformsRows,
    );
  }
  if (nationPrivilegesRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_privileges (nation_idx, object, date) VALUES (?1, ?2, ?3)",
      nationPrivilegesRows,
    );
  }
  if (nationLawsRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_laws (nation_idx, law_category, object, date) VALUES (?1, ?2, ?3, ?4)",
      nationLawsRows,
    );
  }
  await insertRows(
    db,
    "INSERT INTO nation_history (nation_idx, year, metric, value) VALUES (?1, ?2, ?3, ?4)",
    nationHistoryRows,
    (inserted, total) => reportWithinMilestone(inserted / total),
  );
  if (societalValueRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_societal_values (nation_idx, axis, value) VALUES (?1, ?2, ?3)",
      societalValueRows,
    );
  }
  reportMilestone(); // "nations"

  const provinceDatabase = asRecord(asRecord(root.provinces).database);
  const provinceRows: Array<[number, string | null, number | null, number | null]> = [];
  // specs/009-world-goods-production: last_month_produced is a
  // per-province, per-good production quantity (research.md §1 — 52 of
  // this save's 71 tradeable goods, the raw-material/RGO outputs).
  // Captured alongside the rest of this same provinces loop rather than
  // a second pass over provinceDatabase.
  const provinceGoodProductionRows: Array<[number, string, number]> = [];
  for (const [idxStr, value] of Object.entries(provinceDatabase)) {
    const record = asRecord(value);
    const provinceIdx = Number(idxStr);
    provinceRows.push([
      provinceIdx,
      asStringOrNull(record.province_definition),
      asNumberOrNull(record.owner),
      asNumberOrNull(record.capital),
    ]);

    const lastMonthProduced = asRecord(record.last_month_produced);
    for (const [good, amount] of Object.entries(lastMonthProduced)) {
      if (typeof amount === "number") {
        provinceGoodProductionRows.push([provinceIdx, good, amount]);
      }
    }
  }
  await insertRows(
    db,
    "INSERT INTO provinces (idx, name, owner_idx, capital_location_idx) VALUES (?1, ?2, ?3, ?4)",
    provinceRows,
  );
  if (provinceGoodProductionRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO province_good_production (province_idx, good, amount) VALUES (?1, ?2, ?3)",
      provinceGoodProductionRows,
      (inserted, total) => reportWithinMilestone(inserted / total),
    );
  }
  reportMilestone(); // "provinces"

  // Note the doubled key: locations={ locations={ ... } } — the outer
  // object's only content this adapter needs is the inner `locations` map.
  const locationDatabase = asRecord(asRecord(root.locations).locations);
  const locationRows: Array<
    [
      number,
      number | null,
      number | null,
      number | null,
      string | null,
      string | null,
      number | null,
      number | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  > = [];
  // specs/005-map-visualization research.md §2: each location's
  // `population.pops` list references individual `population.database`
  // entries — materialized here as one location_pops row per id, since
  // it's the only place this reverse link exists (population entries
  // carry no location field of their own).
  const locationPopRows: Array<[number, number]> = [];
  for (const [idxStr, value] of Object.entries(locationDatabase)) {
    const record = asRecord(value);
    const locationIdx = Number(idxStr);
    const population = asRecord(record.population);
    // specs/011-atlas-map-modes research.md §3: a location's population
    // breakdown by profession (nobles/clergy/burghers/laborers/soldiers/
    // peasants) — `produced` is this feature's Soldiers layer value,
    // absent (not zero) on a location with no soldiers pop-stats entry.
    const soldiersStats = asRecord(asRecord(population.pop_stats).soldiers);
    locationRows.push([
      locationIdx,
      asNumberOrNull(record.owner),
      asNumberOrNull(record.province),
      asNumberOrNull(record.development),
      compatibilityLocations[locationIdx - 1] ?? null,
      asStringOrNull(record.raw_material),
      asNumberOrNull(record.controller),
      asNumberOrNull(record.control),
      asStringOrNull(record.rank),
      asNumberOrNull(record.culture),
      asNumberOrNull(record.religion),
      asNumberOrNull(record.market),
      asNumberOrNull(record.possible_tax),
      asNumberOrNull(soldiersStats.produced),
    ]);

    const pops = population.pops;
    if (Array.isArray(pops)) {
      for (const popIdx of pops) {
        if (typeof popIdx === "number") locationPopRows.push([locationIdx, popIdx]);
      }
    }
  }
  await insertRows(
    db,
    "INSERT INTO locations (idx, owner_idx, province_idx, development, name, raw_material, controller_idx, control, rank, culture_idx, religion_idx, market_idx, possible_tax, soldiers) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    locationRows,
  );
  if (locationPopRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO location_pops (location_idx, pop_idx) VALUES (?1, ?2)",
      locationPopRows,
    );
  }

  // specs/011-atlas-map-modes research.md §4: culture_manager/
  // religion_manager give each id locations/population already carry
  // (opaque, unresolved) a real name and the save's own in-game color —
  // never parsed before this feature needed them.
  const cultureDatabase = asRecord(asRecord(root.culture_manager).database);
  // specs/012-firepower-tab: culture_group is always NULL here — it's a
  // property of the game's own culture *definitions*, not something the
  // save carries per culture entry, so it can't be read off `record`
  // like color/name can. Resolving it needs a static culture->group
  // reference table (regenerated from game/in_game/common/cultures/*.txt,
  // same pattern as unitTypeReference.ts) that hasn't been built yet —
  // an explicit, documented gap (data-model.md's "known accepted
  // simplification"), not a silent omission: the column exists so a
  // future pass can populate it without a schema change, and until then
  // any culture-group-gated unit unlock is treated as ungated (never
  // blocked on a NULL group) per that same documented fallback.
  const cultureRows: Array<
    [number, string | null, number | null, number | null, number | null, null]
  > = [];
  for (const [idxStr, value] of Object.entries(cultureDatabase)) {
    const record = asRecord(value);
    const rgb = asRgbOrNull(record.color);
    cultureRows.push([
      Number(idxStr),
      asStringOrNull(record.name),
      rgb ? rgb[0] : null,
      rgb ? rgb[1] : null,
      rgb ? rgb[2] : null,
      null,
    ]);
  }
  if (cultureRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO cultures (idx, name, color_r, color_g, color_b, culture_group) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      cultureRows,
    );
  }

  const religionDatabase = asRecord(asRecord(root.religion_manager).database);
  const religionRows: Array<[number, string | null, number | null, number | null, number | null]> = [];
  for (const [idxStr, value] of Object.entries(religionDatabase)) {
    const record = asRecord(value);
    const rgb = asRgbOrNull(record.color);
    religionRows.push([
      Number(idxStr),
      asStringOrNull(record.name),
      rgb ? rgb[0] : null,
      rgb ? rgb[1] : null,
      rgb ? rgb[2] : null,
    ]);
  }
  if (religionRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO religions (idx, name, color_r, color_g, color_b) VALUES (?1, ?2, ?3, ?4, ?5)",
      religionRows,
    );
  }
  reportMilestone(); // "locations"

  const warDatabase = asRecord(asRecord(root.war_manager).database);
  const warRows: Array<[number, string]> = [];
  for (const warEntry of Object.values(warDatabase)) {
    const participants = asRecord(warEntry).all;
    for (const participant of Array.isArray(participants) ? participants : []) {
      const p = asRecord(participant);
      const countryIdx = asNumberOrNull(p.country);
      const status = asStringOrNull(p.status);
      if (countryIdx !== null && status !== null) {
        warRows.push([countryIdx, status]);
      }
    }
  }
  if (warRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO war_participants (nation_idx, status) VALUES (?1, ?2)",
      warRows,
    );
  }

  // war_manager.database, again: one row per war for Encyclopedia's
  // Wars tab (specs/004-full-schema-mapping's schema-mapping tool
  // confirmed these fields against a real save — see schema.sql's
  // comment on the `wars` table for the full rationale). `duration_days`
  // is computed here, not stored raw — for a still-ongoing war (no
  // `end_date`), the reference point is the save's own current in-game
  // date (`metadata.date`), never real wall-clock time.
  const warsRows: Array<
    [
      number,
      string | null,
      number | null,
      number | null,
      string | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  > = [];
  // specs/012-firepower-tab: additive alongside warsRows above (see
  // war_unit_losses' schema.sql comment) — war_idx BIGINT-typed like
  // wars.idx, side is 'attacker' | 'defender'.
  const warUnitLossesRows: Array<
    [number, string, string, number | null, number | null, number | null]
  > = [];
  for (const [warIdxStr, warEntry] of Object.entries(warDatabase)) {
    const war = asRecord(warEntry);
    const startDateRaw = war.start_date;
    if (!(startDateRaw instanceof Date)) continue; // no usable start date — not enough to build a meaningful row
    const endDateRaw = war.end_date instanceof Date ? war.end_date : null;
    const referenceEndRaw = endDateRaw ?? (metadata.date instanceof Date ? metadata.date : null);
    const durationDays = referenceEndRaw
      ? Math.round((referenceEndRaw.getTime() - startDateRaw.getTime()) / 86_400_000)
      : null;
    const originalDefenders = Array.isArray(war.original_defenders) ? war.original_defenders : [];
    const attackerLossesByCategory = extractLossesByCategory(war.attacker_losses);
    const defenderLossesByCategory = extractLossesByCategory(war.defender_losses);
    warsRows.push([
      Number(warIdxStr),
      asStringOrNull(asRecord(war.war_name).name),
      asNumberOrNull(war.original_attacker),
      asNumberOrNull(originalDefenders[0]),
      formatGameDate(startDateRaw),
      endDateRaw ? formatGameDate(endDateRaw) : null,
      durationDays,
      asNumberOrNull(war.attacker_score),
      asNumberOrNull(war.defender_score),
      sumLosses(war.attacker_losses),
      sumLosses(war.defender_losses),
    ]);
    for (const loss of attackerLossesByCategory ?? []) {
      warUnitLossesRows.push([
        Number(warIdxStr),
        "attacker",
        loss.category,
        loss.battle,
        loss.attrition,
        loss.capture,
      ]);
    }
    for (const loss of defenderLossesByCategory ?? []) {
      warUnitLossesRows.push([
        Number(warIdxStr),
        "defender",
        loss.category,
        loss.battle,
        loss.attrition,
        loss.capture,
      ]);
    }
  }
  if (warsRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO wars (idx, war_name_key, attacker_idx, defender_idx, start_date, end_date, duration_days, attacker_score, defender_score, attacker_casualties, defender_casualties) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      warsRows,
    );
  }
  if (warUnitLossesRows.length > 0) {
    // specs/012-firepower-tab
    await insertRows(
      db,
      "INSERT INTO war_unit_losses (war_idx, side, category, battle, attrition, capture) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      warUnitLossesRows,
    );
  }
  reportMilestone(); // "wars"

  // specs/012-firepower-tab: subunit_manager.database, one row per
  // regiment/ship. idx is BIGINT — sibling unit_manager stack ids
  // already exceed INT32 in a real save. strength is army-only; the
  // field is genuinely absent for navy subunits (never fabricated).
  const subunitDatabase = asRecord(asRecord(root.subunit_manager).database);
  // specs/019-battle-simulator research.md §5: + unit (parent army),
  // box (raw section, NULL when omitted — combat-unknowns.md U-25) and
  // experience (NULL when absent, never 0-filled). Unknown box values are
  // stored as-is and surfaced as a load warning (constitution II).
  const KNOWN_BOXES = new Set(["Left", "Right", "Center", "Reserves", "Captured"]);
  const unknownBoxes = new Set<string>();
  let unknownBoxCount = 0;
  const regimentRows: Array<
    [
      number,
      number | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      string | null,
      number | null,
    ]
  > = [];
  for (const [subunitIdxStr, subunitEntry] of Object.entries(subunitDatabase)) {
    const subunit = asRecord(subunitEntry);
    const box = asStringOrNull(subunit.box);
    if (box !== null && !KNOWN_BOXES.has(box)) {
      unknownBoxes.add(box);
      unknownBoxCount += 1;
    }
    regimentRows.push([
      Number(subunitIdxStr),
      asNumberOrNull(subunit.owner),
      asStringOrNull(subunit.type),
      asNumberOrNull(subunit.morale),
      asNumberOrNull(subunit.number),
      asNumberOrNull(subunit.strength),
      asNumberOrNull(subunit.unit),
      box,
      asNumberOrNull(subunit.experience),
    ]);
  }
  if (regimentRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO regiments (idx, owner_idx, unit_type, morale, number, strength, unit_idx, box, experience) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      regimentRows,
    );
  }
  const warnings: LoadWarning[] = [];
  if (unknownBoxCount > 0) {
    warnings.push({
      kind: "unrecognized-values",
      count: unknownBoxCount,
      message: `${unknownBoxCount} ${unknownBoxCount === 1 ? "regiment has" : "regiments have"} an unrecognized battle section (${[...unknownBoxes].join(", ")}); the Battle Simulator treats ${unknownBoxCount === 1 ? "it" : "them"} as center.`,
    });
  }

  // specs/019-battle-simulator: unit_manager land stacks → armies, and the
  // characters leading them → generals.
  const unitDatabase = asRecord(asRecord(root.unit_manager).database);
  const armyRows: Array<[number, number | null, number | null, string | null, number | null, string | null]> = [];
  const leaderIdxs = new Set<number>();
  for (const [unitIdxStr, unitEntry] of Object.entries(unitDatabase)) {
    const unit = asRecord(unitEntry);
    if (unit.is_army !== true && unit.is_army !== "yes") continue;
    const leader = asNumberOrNull(unit.leader);
    if (leader !== null) leaderIdxs.add(leader);
    armyRows.push([
      Number(unitIdxStr),
      asNumberOrNull(unit.country),
      leader,
      asStringOrNull(unit.unit_formation_preference),
      asNumberOrNull(unit.location),
      asStringOrNull(asRecord(unit.unit_name_2).key),
    ]);
  }
  if (armyRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO armies (idx, country_idx, leader_idx, formation, location_idx, name_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      armyRows,
    );
  }
  const generalCharacters = asRecord(asRecord(root.character_db).database);
  const generalRows: Array<[number, number | null, string | null]> = [];
  for (const leaderIdx of leaderIdxs) {
    const character = generalCharacters[String(leaderIdx)];
    if (character === undefined) continue;
    const rec = asRecord(character);
    generalRows.push([leaderIdx, asNumberOrNull(rec.mil), asStringOrNull(rec.general_trait)]);
  }
  if (generalRows.length > 0) {
    await insertRows(db, "INSERT INTO generals (idx, mil, general_trait) VALUES (?1, ?2, ?3)", generalRows);
  }

  // population.database: one row per population group. Fixed-shape
  // scalar fields become real columns; `missing` (a variable-keyed
  // trade-good deficit map — confirmed against a real save via
  // specs/004-full-schema-mapping's schema-mapping tool) is captured
  // losslessly as JSON text rather than one column per possible good.
  const populationDatabase = asRecord(asRecord(root.population).database);
  const populationRows: Array<
    [
      number,
      string | null,
      string | null,
      number | null,
      number | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      string | null,
    ]
  > = [];
  for (const [idxStr, value] of Object.entries(populationDatabase)) {
    const record = asRecord(value);
    const missing = record.missing;
    const missingGoods =
      missing !== null && typeof missing === "object" && !Array.isArray(missing)
        ? JSON.stringify(missing)
        : null;
    populationRows.push([
      Number(idxStr),
      asStringOrNull(record.type),
      asStringOrNull(record.estate),
      asNumberOrNull(record.culture),
      asNumberOrNull(record.religion),
      asStringOrNull(record.status),
      asNumberOrNull(record.size),
      asNumberOrNull(record.literacy),
      asNumberOrNull(record.satisfaction),
      asNumberOrNull(record.owner),
      missingGoods,
    ]);
  }
  if (populationRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO population (idx, pop_type, estate, culture, religion, status, size, literacy, satisfaction, owner_idx, missing_goods) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      populationRows,
    );
  }
  reportMilestone(); // "population"

  // market_manager.database: one row per market (specs/007-production-
  // trade-markets data-model.md). No name field exists in the save at
  // all — display name is derived at query time (queries.ts) from
  // center_location_idx. `member_count` is `members`' list length (the
  // save also carries a separate `market`/`migration` list per entry;
  // `members` was chosen as the closest name-match for "locations
  // belonging to this market" — research.md flags this for
  // re-verification against a real full save). A market with no `goods`
  // sub-object at all (2 of 184 in the reference save) contributes zero
  // market_goods rows, never zero-value ones (FR-006).
  const marketDatabase = asRecord(asRecord(root.market_manager).database);
  const marketRows: Array<[number, number | null, number | null, number | null]> = [];
  const marketGoodRows: Array<
    [
      number,
      string,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  > = [];

  for (const [idxStr, value] of Object.entries(marketDatabase)) {
    const record = asRecord(value);
    const marketIdx = Number(idxStr);
    const members = record.members;
    marketRows.push([
      marketIdx,
      asNumberOrNull(record.center),
      Array.isArray(members) ? members.length : null,
      asNumberOrNull(record.capacity),
    ]);

    const goods = asRecord(record.goods);
    for (const [good, goodValue] of Object.entries(goods)) {
      const g = asRecord(goodValue);
      const productionSupplied = asRecord(g.production_supplied);
      const supplied = asRecord(g.supplied);
      const demanded = asRecord(g.demanded);
      // demanded.Trade + demanded.BurgherTrades merged into one "trade"
      // figure (data-model.md: spec has one trade bucket, the save has
      // two) — stays null only if BOTH source fields are absent, never
      // if just one of the two is a confirmed 0.
      const demandTradeRaw = asNumberOrNull(demanded.Trade);
      const demandBurgherRaw = asNumberOrNull(demanded.BurgherTrades);
      const demandTrade =
        demandTradeRaw === null && demandBurgherRaw === null
          ? null
          : (demandTradeRaw ?? 0) + (demandBurgherRaw ?? 0);
      marketGoodRows.push([
        marketIdx,
        good,
        asNumberOrNull(g.price),
        asNumberOrNull(g.supply),
        asNumberOrNull(g.demand),
        asNumberOrNull(g.stockpile),
        typeof g.import === "boolean" ? (g.import ? 1 : 0) : null,
        typeof g.export === "boolean" ? (g.export ? 1 : 0) : null,
        asNumberOrNull(productionSupplied.RawMaterials),
        asNumberOrNull(productionSupplied.Buildings),
        asNumberOrNull(supplied.Trade),
        asNumberOrNull(demanded.Pops),
        demandTrade,
        asNumberOrNull(demanded.Building),
        asNumberOrNull(demanded.Units),
        asNumberOrNull(demanded.Construction),
      ]);
      // Per-good `history` (price time series) is deliberately NOT
      // extracted — removed after a real user report: pulling it for
      // every good in every market was the single largest cost in
      // parsing a real save, for a feature (a per-market/good price
      // chart) that wasn't worth that cost. See ARCHITECTURE.md's
      // decision log.
    }
  }
  await insertRows(
    db,
    "INSERT INTO markets (idx, center_location_idx, member_count, capacity) VALUES (?1, ?2, ?3, ?4)",
    marketRows,
  );
  if (marketGoodRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO market_goods (market_idx, good, price, supply, demand, stockpile, is_importing, is_exporting, supply_raw_materials, supply_buildings, supply_trade, demand_population, demand_trade, demand_building_upkeep, demand_unit_upkeep, demand_construction) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
      marketGoodRows,
      (inserted, total) => reportWithinMilestone(inserted / total),
    );
  }
  reportMilestone(); // "markets"

  // market_manager.produced_goods: the save's own world-total snapshot
  // per good — read directly, never summed client-side from
  // market_goods (data-model.md).
  const producedGoods = asRecord(asRecord(root.market_manager).produced_goods);
  const worldGoodProductionRows: Array<[string, number]> = [];
  for (const [good, total] of Object.entries(producedGoods)) {
    if (typeof total === "number") worldGoodProductionRows.push([good, total]);
  }
  if (worldGoodProductionRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO world_good_production (good, total) VALUES (?1, ?2)",
      worldGoodProductionRows,
    );
  }
  reportMilestone(); // "world-goods"

  // rulerterm_manager.database: one row per historical reign, joined
  // in-JS against character_db.database for that ruler's adm/dip/mil
  // (denormalized at parse time — simpler than adding a separate
  // `characters` table and joining in SQL, since both maps are already
  // in memory here). Ruler History stretch goal (specs/006-country-
  // leaderboard) — see schema.sql's comment on `ruler_history` for the
  // exact filtering/simplification rules.
  const characterDatabase = asRecord(asRecord(root.character_db).database);
  const rulerTermDatabase = asRecord(asRecord(root.rulerterm_manager).database);
  const rulerHistoryRows: Array<
    [
      number,
      string,
      number | null,
      string | null,
      string | null,
      number | null,
      number | null,
      number | null,
    ]
  > = [];
  for (const value of Object.values(rulerTermDatabase)) {
    const term = asRecord(value);
    if (asStringOrNull(term.ruled_type) !== "Country") continue;
    if (asStringOrNull(term.ruler_type) !== "Character") continue;
    const nationIdx = asNumberOrNull(term.ruled);
    const startDateRaw = term.start_date;
    if (nationIdx === null || !(startDateRaw instanceof Date)) continue;

    const characters = asRecord(term.ruler).characters;
    const firstCharacter = asRecord(Array.isArray(characters) ? characters[0] : undefined);
    const characterIdx = asNumberOrNull(firstCharacter.character);
    if (characterIdx === null) continue; // interregnum/regency term — no character to score

    const character = asRecord(characterDatabase[String(characterIdx)]);
    rulerHistoryRows.push([
      nationIdx,
      formatGameDate(startDateRaw)!,
      asNumberOrNull(firstCharacter.regnal_number),
      // first_name is a localization key (e.g. "name_birger"), resolved
      // client-side against rulerNames.json — never localized here.
      // nickname, when present, is already real display text in the
      // save (e.g. "Ladulas"), not a key — stored as-is.
      asStringOrNull(character.first_name),
      asStringOrNull(character.nickname),
      asNumberOrNull(character.adm),
      asNumberOrNull(character.dip),
      asNumberOrNull(character.mil),
    ]);
  }
  if (rulerHistoryRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO ruler_history (nation_idx, start_date, regnal_number, first_name_key, nickname, adm, dip, mil) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      rulerHistoryRows,
      (inserted, total) => reportWithinMilestone(inserted / total),
    );
  }
  reportMilestone(); // "ruler-history"

  // specs/013-diplomatic-relations-chord: diplomacy_manager, previously
  // only in raw_sections (research.md §1). scripted_mutual/
  // scripted_oneway carry a dozen+ treaty-type object= values
  // (military_access, trade_access, embargo_nation, etc.) — only
  // alliance and guarantee are extracted here, everything else is read
  // and discarded (spec Assumptions' v1 scope). royal_marriage is its
  // own dedicated entry type. rivals_2.list and relations.<target>.trust
  // live per-country, keyed by that country's own idx as a top-level
  // diplomacy_manager key (distinguished from the relation-type keys
  // above by being purely numeric).
  const diplomacyManager = asRecord(root.diplomacy_manager);
  toArray(diplomacyManager, "royal_marriage");
  toArray(diplomacyManager, "scripted_mutual");
  toArray(diplomacyManager, "scripted_oneway");
  toArray(diplomacyManager, "economic_support");

  const asDiplomacyArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : value !== null && value !== undefined ? [value] : [];

  function relationTypeObject(entry: Record<string, unknown>): string | null {
    for (const target of asDiplomacyArray(entry.named_targets)) {
      const t = asRecord(target);
      if (t.flag === "scripted_relation_type") {
        return asStringOrNull(asRecord(t.target).object);
      }
    }
    return null;
  }

  // Post-ship, 2026-09-22 (explicit user request): economic_support's
  // named_targets carries the ducat amount under flag=amount,
  // target.identity (not target.object like relation-type entries, and
  // not target.value despite type=value — confirmed against the real
  // save).
  function namedTargetAmount(entry: Record<string, unknown>): number | null {
    for (const target of asDiplomacyArray(entry.named_targets)) {
      const t = asRecord(target);
      if (t.flag === "amount") {
        return asNumberOrNull(asRecord(t.target).identity);
      }
    }
    return null;
  }

  // Keyed by the UNORDERED pair (dedup only — a relation recorded under
  // both sides, e.g. rivalry, must collapse to one row, never two).
  // Stored first/second preserve the save's own field order for
  // one-way relations (direction matters); for symmetric types
  // (isOneWay=false) they're normalized to min/max instead, same as
  // before this feature tracked direction at all, since no direction is
  // implied either way and existing fixture/test expectations already
  // assume that normalization for rivalry/alliance/royal_marriage.
  const diplomaticRelationsMap = new Map<
    string,
    [number, number, string, string | null, number | null, boolean]
  >();
  function addRelation(
    firstRaw: number | null,
    secondRaw: number | null,
    relationType: string,
    startDate: string | null,
    isOneWay: boolean,
    amount: number | null = null,
  ): void {
    if (firstRaw === null || secondRaw === null || firstRaw === secondRaw) return;
    const unorderedKey = `${Math.min(firstRaw, secondRaw)}:${Math.max(firstRaw, secondRaw)}:${relationType}`;
    if (diplomaticRelationsMap.has(unorderedKey)) return;
    const [first, second] = isOneWay
      ? [firstRaw, secondRaw]
      : [Math.min(firstRaw, secondRaw), Math.max(firstRaw, secondRaw)];
    diplomaticRelationsMap.set(unorderedKey, [first, second, relationType, startDate, amount, isOneWay]);
  }

  for (const entry of asDiplomacyArray(diplomacyManager.royal_marriage)) {
    const e = asRecord(entry);
    addRelation(
      asNumberOrNull(e.first),
      asNumberOrNull(e.second),
      "royal_marriage",
      formatGameDate(e.start_date),
      false,
    );
  }
  // economic_support is its own top-level entry type (not a
  // scripted_mutual/scripted_oneway object=), same first/second/
  // start_date shape as royal_marriage (confirmed against the real
  // save: first/second/named_targets.amount/start_date) — a one-
  // directional grant by nature (first gives to second), so isOneWay=true.
  for (const entry of asDiplomacyArray(diplomacyManager.economic_support)) {
    const e = asRecord(entry);
    addRelation(
      asNumberOrNull(e.first),
      asNumberOrNull(e.second),
      "economic_support",
      formatGameDate(e.start_date),
      true,
      namedTargetAmount(e),
    );
  }
  // Post-ship, 2026-09-22 (explicit user request, cross-checked against
  // every relation_type object= value the real save contains): widened
  // from alliance/guarantee to also cover military_access, food_access,
  // and fleet_basing_rights. Every other object= value stays parsed-and-
  // discarded (trade_access, embargo_nation, etc. — still out of v1
  // scope). isOneWay is derived from which container the entry came
  // from, not guessed: exhaustively confirmed against the real save
  // (every occurrence) that alliance is ALWAYS scripted_mutual and every
  // other type, guarantee included, is ALWAYS scripted_oneway.
  const EXTRACTED_RELATION_TYPES = new Set([
    "alliance",
    "guarantee",
    "military_access",
    "food_access",
    "fleet_basing_rights",
  ]);
  for (const sourceKey of ["scripted_mutual", "scripted_oneway"] as const) {
    for (const entry of asDiplomacyArray(diplomacyManager[sourceKey])) {
      const e = asRecord(entry);
      const relationType = relationTypeObject(e);
      if (relationType === null || !EXTRACTED_RELATION_TYPES.has(relationType)) continue;
      addRelation(
        asNumberOrNull(e.first),
        asNumberOrNull(e.second),
        relationType,
        formatGameDate(e.start_date),
        sourceKey === "scripted_oneway",
      );
    }
  }

  // Post-ship, 2026-09-22 (explicit user request, "diplomatic score...
  // 200 to -200"): the save has no single stored "Opinion" scalar
  // (confirmed by exhaustively listing every field name a real
  // relations.<target> entry carries: trust, disposition, timed_biases,
  // last_war, war_score, diplomat_return_date, last_spy_discovery — no
  // "opinion="). Derived here as the sum of every
  // timed_biases.Opinion[].value and .Antagonism[].value entry, the same
  // named modifier-stack the save itself groups under those two labels
  // (Antagonism entries are already negative, e.g.
  // antagonism_improve_relation=-59.47151 — a plain sum, no extra sign
  // flip). Single-occurrence Opinion/Antagonism lists need the same
  // asDiplomacyArray normalization as everywhere else in this file.
  function opinionScoreFor(relationEntry: Record<string, unknown>): number | null {
    const timedBiases = asRecord(relationEntry.timed_biases);
    const opinionEntries = asDiplomacyArray(timedBiases.Opinion);
    const antagonismEntries = asDiplomacyArray(timedBiases.Antagonism);
    if (opinionEntries.length === 0 && antagonismEntries.length === 0) return null; // no timed_biases at all -- unknown, never a fabricated 0
    let sum = 0;
    for (const e of [...opinionEntries, ...antagonismEntries]) {
      const v = asNumberOrNull(asRecord(e).value);
      if (v !== null) sum += v;
    }
    return sum;
  }

  const trustRows: Array<[number, number, number, number | null]> = [];
  for (const [ownerIdxStr, countryEntry] of Object.entries(diplomacyManager)) {
    if (!/^\d+$/.test(ownerIdxStr)) continue; // skip royal_marriage/scripted_mutual/scripted_oneway/dependency
    const ownerIdx = Number(ownerIdxStr);
    const country = asRecord(countryEntry);

    const rivalsList = asDiplomacyArray(asRecord(country.rivals_2).list);
    for (const rival of rivalsList) {
      const r = asRecord(rival);
      addRelation(ownerIdx, asNumberOrNull(r.country), "rivalry", formatGameDate(r.date), false);
    }

    for (const [targetIdxStr, relationEntry] of Object.entries(asRecord(country.relations))) {
      if (!/^\d+$/.test(targetIdxStr)) continue;
      const r = asRecord(relationEntry);
      const trust = asNumberOrNull(r.trust);
      if (trust !== null) trustRows.push([ownerIdx, Number(targetIdxStr), trust, opinionScoreFor(r)]);
    }
  }

  // insertRows' bulk Arrow-insert path only accepts string/number/null
  // per row (same reasoning as market_goods.is_importing/is_exporting) —
  // isOneWay converts to INTEGER 0/1 here, at the insert boundary.
  const diplomaticRelationsRows: Array<[number, number, string, string | null, number | null, number]> =
    Array.from(diplomaticRelationsMap.values()).map(([first, second, type, date, amount, isOneWay]) => [
      first,
      second,
      type,
      date,
      amount,
      isOneWay ? 1 : 0,
    ]);
  if (diplomaticRelationsRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO diplomatic_relations (first_nation_idx, second_nation_idx, relation_type, start_date, amount, is_one_way) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      diplomaticRelationsRows,
    );
  }
  if (trustRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO nation_relation_trust (owner_nation_idx, target_nation_idx, trust, opinion_score) VALUES (?1, ?2, ?3, ?4)",
      trustRows,
    );
  }
  reportMilestone(); // "diplomacy"

  // specs/014-country-province-map-modes research.md §2: one row per
  // work_of_art_manager.database entry, destroyed and unowned works
  // included (the map query filters, this table stays a faithful copy).
  // `owner` is a country idx — confirmed against the real save (289 =
  // GBR holding the Bayeux Tapestry), not a character id. Small enough
  // (~5k entries on a real save) to ride the "diplomacy" milestone rather
  // than shift every progress percentage with a new one.
  const workOfArtDatabase = asRecord(asRecord(root.work_of_art_manager).database);
  const worksOfArtRows: Array<[number, number | null, string | null, number | null, number | null, string | null]> = [];
  for (const [idxStr, value] of Object.entries(workOfArtDatabase)) {
    const record = asRecord(value);
    worksOfArtRows.push([
      Number(idxStr),
      asNumberOrNull(record.owner),
      asStringOrNull(record.type),
      asNumberOrNull(record.quality),
      asNumberOrNull(record.location),
      formatGameDate(record.destroyed_date),
    ]);
  }
  if (worksOfArtRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO works_of_art (idx, owner_idx, type, quality, location_idx, destroyed_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      worksOfArtRows,
    );
  }

  // Every other top-level section: no real schema yet, so capture as
  // opaque JSON rather than guess at columns for structure nobody has
  // inspected (constitution Principle II).
  //
  // `id` is generated here (not left to schema.sql's DEFAULT nextval)
  // because insertRows' Arrow-bulk-insert path requires every row to
  // supply every column of the target table positionally — confirmed via
  // a real browser test that a column-subset insert throws "table
  // raw_sections has 3 columns but 2 values were supplied". Safe to
  // assign sequentially in JS: this is the only writer, in one bulk call,
  // never concurrent with anything else touching this table.
  const rawRows: Array<[number, string, string]> = [];
  let rawSectionId = 0;
  for (const [key, value] of Object.entries(root)) {
    if (STRUCTURED_KEYS.has(key)) continue;
    rawRows.push([rawSectionId++, key, JSON.stringify(value)]);
  }
  if (rawRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO raw_sections (id, key, data) VALUES (?1, ?2, ?3)",
      rawRows,
    );
  }
  reportMilestone(); // "raw-sections"

  await insertRows(
    db,
    "INSERT INTO save_meta (id, filename, detected_version, supported, in_game_date, loaded_at, kept) VALUES (?1, ?2, ?3, 1, ?4, ?5, 0)",
    [[saveId, filename, version, inGameDate, new Date().toISOString()]],
  );

  let playerTag = "";
  if (playerIdx !== null) {
    playerTag = tags[String(playerIdx)] ?? "";
    if (playerTag) {
      await insertRows(
        db,
        "UPDATE nations SET is_player = 1, name = ?2 WHERE idx = ?1",
        [[playerIdx, playerCountryName]],
      );
    }
  }
  reportMilestone(); // "done"

  return { inGameDate, playerNationTag: playerTag, ...(warnings.length > 0 ? { warnings } : {}) };
}
