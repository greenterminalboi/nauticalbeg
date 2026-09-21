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

export interface ParsedSaveSummary {
  inGameDate: string;
  playerNationTag: string;
}

// Sections with a real, structured table (see the extraction below).
// Every other top-level key falls into the `raw_sections` catch-all.
const STRUCTURED_KEYS = new Set([
  "metadata",
  "countries",
  "provinces",
  "locations",
  "war_manager",
  "played_country",
  "population",
  "market_manager",
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

/** specs/007-production-trade-markets research.md §1/data-model.md: a
 * price-history point has no embedded date in the save at all — this
 * computes one, counting back `monthsBack` whole months from the save's
 * own current date (`metadata.date`), on the researched-but-unconfirmed
 * assumption that `history` entries are monthly. Returns an ISO
 * "YYYY-MM" string. */
function isoYearMonth(gameDate: Date, monthsBack: number): string {
  const totalMonths = gameDate.getUTCFullYear() * 12 + gameDate.getUTCMonth() - monthsBack;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12; // 0-11, always positive
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Sums a war's `attacker_losses`/`defender_losses` field (shape:
 * `{ losses: { <unit_type>: { Battle?, Attrition?, Capture? } } }`) into
 * one total. Returns `null` — not `0` — when the field never appeared
 * at all (unknown, per constitution Principle IV), distinct from a
 * present-but-empty `losses` map, which is a real, confirmed zero. */
function sumLosses(lossesField: unknown): number | null {
  const outer = asRecord(lossesField);
  if (!("losses" in outer)) return null;
  let total = 0;
  for (const unitLosses of Object.values(asRecord(outer.losses))) {
    for (const amount of Object.values(asRecord(unitLosses))) {
      if (typeof amount === "number") total += amount;
    }
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
  "market-price-history", // split from "markets" -- typically this feature's single largest table
  "world-goods",
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
    ]);
    for (const [field, metric] of HISTORY_METRICS) {
      const values = asNumberArray(record[field]);
      values.forEach((value, i) => {
        nationHistoryRows.push([idx, HISTORY_START_YEAR + i, metric, value]);
      });
    }
  }
  await insertRows(
    db,
    "INSERT INTO nations (idx, tag, name, country_type, is_player, treasury, stability, government_type, color_r, color_g, color_b, is_human_played) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    nationRows,
  );
  await insertRows(
    db,
    "INSERT INTO nation_history (nation_idx, year, metric, value) VALUES (?1, ?2, ?3, ?4)",
    nationHistoryRows,
  );
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
    locationRows.push([
      locationIdx,
      asNumberOrNull(record.owner),
      asNumberOrNull(record.province),
      asNumberOrNull(record.development),
      compatibilityLocations[locationIdx - 1] ?? null,
      asStringOrNull(record.raw_material),
      asNumberOrNull(record.controller),
      asNumberOrNull(record.control),
    ]);

    const pops = asRecord(record.population).pops;
    if (Array.isArray(pops)) {
      for (const popIdx of pops) {
        if (typeof popIdx === "number") locationPopRows.push([locationIdx, popIdx]);
      }
    }
  }
  await insertRows(
    db,
    "INSERT INTO locations (idx, owner_idx, province_idx, development, name, raw_material, controller_idx, control) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    locationRows,
  );
  if (locationPopRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO location_pops (location_idx, pop_idx) VALUES (?1, ?2)",
      locationPopRows,
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
  }
  if (warsRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO wars (idx, war_name_key, attacker_idx, defender_idx, start_date, end_date, duration_days, attacker_score, defender_score, attacker_casualties, defender_casualties) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      warsRows,
    );
  }
  reportMilestone(); // "wars"

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
  const gameDate = metadata.date instanceof Date ? metadata.date : null;
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
  const marketGoodPriceHistoryRows: Array<[number, string, string, number]> = [];

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

      if (gameDate) {
        const history = asNumberArray(g.history);
        history.forEach((price, i) => {
          const monthsBack = history.length - 1 - i;
          marketGoodPriceHistoryRows.push([
            marketIdx,
            good,
            isoYearMonth(gameDate, monthsBack),
            price,
          ]);
        });
      }
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
    );
  }
  reportMilestone(); // "markets"
  if (marketGoodPriceHistoryRows.length > 0) {
    await insertRows(
      db,
      "INSERT INTO market_good_price_history (market_idx, good, date, price) VALUES (?1, ?2, ?3, ?4)",
      marketGoodPriceHistoryRows,
    );
  }
  reportMilestone(); // "market-price-history"

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

  return { inGameDate, playerNationTag: playerTag };
}
