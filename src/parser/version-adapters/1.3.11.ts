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

export async function parseAndStore(
  db: SaveDatabase,
  saveId: string,
  filename: string,
  data: Uint8Array,
): Promise<ParsedSaveSummary> {
  const parser = await Jomini.initialize();
  const root = asRecord(parser.parseText(data, { typeNarrowing: "unquoted" }));

  const metadata = asRecord(root.metadata);
  const inGameDate = formatGameDate(metadata.date);
  const version = asStringOrNull(metadata.version);
  const playerCountryName = asStringOrNull(metadata.player_country_name);
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

  const countriesSection = asRecord(root.countries);
  const tags = asRecord(countriesSection.tags) as Record<string, string>; // { "2025": "RUS", ... }
  const countryDatabase = asRecord(countriesSection.database);

  const nationRows: Array<
    [number, string, null, string | null, number, number | null, number | null, string | null]
  > = [];
  for (const [idxStr, tag] of Object.entries(tags)) {
    const record = asRecord(countryDatabase[idxStr]);
    const currencyData = asRecord(record.currency_data);
    const government = asRecord(record.government);
    nationRows.push([
      Number(idxStr),
      tag,
      null, // name: only the player nation gets one, set via UPDATE below once known
      asStringOrNull(record.country_type),
      0, // is_player: corrected below once played_country is resolved
      asNumberOrNull(currencyData.gold),
      asNumberOrNull(currencyData.stability),
      asStringOrNull(government.type),
    ]);
  }
  await insertRows(
    db,
    "INSERT INTO nations (idx, tag, name, country_type, is_player, treasury, stability, government_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    nationRows,
  );

  const provinceDatabase = asRecord(asRecord(root.provinces).database);
  const provinceRows: Array<[number, string | null, number | null, number | null]> = [];
  for (const [idxStr, value] of Object.entries(provinceDatabase)) {
    const record = asRecord(value);
    provinceRows.push([
      Number(idxStr),
      asStringOrNull(record.province_definition),
      asNumberOrNull(record.owner),
      asNumberOrNull(record.capital),
    ]);
  }
  await insertRows(
    db,
    "INSERT INTO provinces (idx, name, owner_idx, capital_location_idx) VALUES (?1, ?2, ?3, ?4)",
    provinceRows,
  );

  // Note the doubled key: locations={ locations={ ... } } — the outer
  // object's only content this adapter needs is the inner `locations` map.
  const locationDatabase = asRecord(asRecord(root.locations).locations);
  const locationRows: Array<[number, number | null, number | null, number | null]> = [];
  for (const [idxStr, value] of Object.entries(locationDatabase)) {
    const record = asRecord(value);
    locationRows.push([
      Number(idxStr),
      asNumberOrNull(record.owner),
      asNumberOrNull(record.province),
      asNumberOrNull(record.development),
    ]);
  }
  await insertRows(
    db,
    "INSERT INTO locations (idx, owner_idx, province_idx, development) VALUES (?1, ?2, ?3, ?4)",
    locationRows,
  );

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

  return { inGameDate, playerNationTag: playerTag };
}
