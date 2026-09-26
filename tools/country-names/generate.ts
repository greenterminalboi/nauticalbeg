// CLI entrypoint for the Countries tab name lookup (specs/018-country-
// factbook-tabs research.md R8). The save stores laws, policies,
// privileges, estates, pop types, subject types and government types as
// raw keys (e.g. `noble_levies`). Most of their display names are already
// in public/encyclopedia/*.json (008), but those files total ~900KB, too
// much to bundle just for names. Policy names aren't in them at all: they
// live in the game's localization (`laws_and_policies_l_english.yml`).
// This script distills both into one small JSON the app imports.
//
// Mirrors tools/ruler-names-scraping/generate.ts's --install/--out CLI.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Jomini } from "jomini";
import { parseLocalization } from "../encyclopedia-scraping/parse-localization";

const DEFAULT_OUT_PATH = "src/components/Overview/countryNames.json";
// specs/018 (owner request 2026-09-26): what each policy and privilege
// actually does, shown on hover/selection in the Government tab. A
// separate file so it can be loaded only when that tab opens.
const MODIFIERS_FILE = "countryModifiers.json";
const ENCYCLOPEDIA_DIR = "public/encyclopedia";

export class CliError extends Error {}

export interface CliOptions {
  installPath: string;
  outPath: string;
}

interface EncyclopediaEntry {
  key: string;
  name: string | null;
  fields: Record<string, unknown>;
}

export interface CountryNames {
  governmentPowers: Record<string, string>;
  laws: Record<string, string>;
  policies: Record<string, string>;
  privileges: Record<string, { name: string; estate: string | null }>;
  estates: Record<string, string>;
  popTypes: Record<string, string>;
  subjectTypes: Record<string, string>;
}

export function parseArgs(argv: string[]): CliOptions {
  let installPath: string | undefined;
  let outPath = DEFAULT_OUT_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") {
      installPath = argv[++i];
    } else if (argv[i] === "--out") {
      outPath = argv[++i] ?? outPath;
    }
  }
  if (!installPath) {
    throw new CliError("--install <path-to-eu5-install> is required.");
  }
  return { installPath, outPath };
}

function readEntries(category: string): EncyclopediaEntry[] {
  const file = join(ENCYCLOPEDIA_DIR, `${category}.json`);
  if (!existsSync(file)) {
    throw new CliError(`${file} is missing — run npm run generate:encyclopedia first.`);
  }
  return JSON.parse(readFileSync(file, "utf-8")) as EncyclopediaEntry[];
}

function humanize(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

type Localization = ReturnType<typeof parseLocalization>;

/** Turns raw game text into plain display text: `$key$` references are
 * resolved from the localization (a few levels deep), script calls like
 * [ShowLawName('bergregal_law')] become their quoted key made readable,
 * and color/icon codes (#G … #!, @icon!) are removed. */
export function cleanText(text: string, localization: Localization, depth = 0): string {
  return text
    .replace(/\$([A-Za-z0-9_.]+)\$/g, (_, key: string) => {
      const inner = localization.get(key)?.name;
      return inner && depth < 3 ? cleanText(inner, localization, depth + 1) : humanize(key);
    })
    .replace(/\[[^\]]*?'([A-Za-z0-9_]+)'[^\]]*\]/g, (_, key: string) => humanize(key))
    .replace(/\[[^\]]*\]/g, "")
    .replace(/@[A-Za-z0-9_]+!/g, "")
    .replace(/#[A-Za-z_]+\s?/g, "")
    .replace(/#!/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMap(entries: EncyclopediaEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) if (e.name) out[e.key] = e.name;
  return out;
}

function mapValues<T>(record: Record<string, T>, fn: (value: T) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

export function buildCountryNames(installPath: string, localization = parseLocalization(installPath)): CountryNames {
  // Game text embeds other keys as `$key$` (e.g. "Primacy of
  // $nobles_estate$"). Resolve them from the same localization, a few
  // levels deep; anything unresolvable is left out rather than shown raw.
  const resolve = (text: string): string => cleanText(text, localization);
  const localized = (key: string): string | null => {
    const name = localization.get(key)?.name;
    return name ? resolve(name) || null : null;
  };

  const governmentPowers: Record<string, string> = {};
  for (const e of readEntries("government_types")) {
    const power = e.fields.government_power;
    if (typeof power !== "string") continue;
    const label = localized(power);
    if (label) governmentPowers[e.key] = label;
  }

  // A law's policies are the object-valued keys of its fields that the
  // game localizes as a name (`potential`, `allow` etc. have no entry).
  const laws = readEntries("laws");
  const policies: Record<string, string> = {};
  for (const law of laws) {
    for (const [key, value] of Object.entries(law.fields)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const label = localized(key);
      if (label) policies[key] = label;
    }
  }

  const privileges: CountryNames["privileges"] = {};
  for (const e of readEntries("estate_privileges")) {
    if (!e.name) continue;
    const estate = e.fields.estate;
    privileges[e.key] = { name: e.name, estate: typeof estate === "string" ? estate : null };
  }

  const clean = (name: string) => resolve(name);
  return {
    governmentPowers: sorted(governmentPowers),
    laws: sorted(mapValues(nameMap(laws), clean)),
    policies: sorted(policies),
    privileges: sorted(mapValues(privileges, (p) => ({ ...p, name: clean(p.name) }))),
    estates: sorted(mapValues(nameMap(readEntries("estates")), clean)),
    popTypes: sorted(mapValues(nameMap(readEntries("pop_types")), clean)),
    subjectTypes: sorted(mapValues(nameMap(readEntries("subject_types")), clean)),
  };
}

/** How the game formats one modifier (main_menu/common/
 * modifier_type_definitions): `percent` values are fractions shown ×100,
 * `alreadyPercent` ones are shown as-is with %, `boolean` ones are on/off,
 * `bad` means a higher value is worse for the country, and `neutral`
 * means neither direction is better (the game leaves those uncolored). */
export interface ModifierType {
  name: string;
  percent?: true;
  alreadyPercent?: true;
  boolean?: true;
  decimals?: number;
  bad?: true;
  /** No good/bad direction (e.g. societal value drift): never colored. */
  neutral?: true;
}

/** A modifier's value: a number, true for an on/off modifier, or the raw
 * text of a value the generator couldn't resolve to a number. */
export type ModifierValue = number | boolean | string;

export interface CountryModifiers {
  modifierTypes: Record<string, ModifierType>;
  policies: Record<string, Array<[string, ModifierValue]>>;
  privileges: Record<string, Array<[string, ModifierValue]>>;
}

function readScriptFiles(dir: string): Array<{ file: string; text: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({ file: join(dir, f), text: readFileSync(join(dir, f), "utf-8") }));
}

export async function buildCountryModifiers(
  installPath: string,
  localization = parseLocalization(installPath),
): Promise<{ modifiers: CountryModifiers; unresolved: string[]; skippedFiles: string[] }> {
  const parser = await Jomini.initialize();
  // A file jomini can't parse is skipped and reported, like the
  // encyclopedia scraper does; its constants just stay unresolved.
  const skippedFiles: string[] = [];
  const parse = ({ file, text }: { file: string; text: string }): Record<string, unknown> => {
    try {
      return parser.parseText(text, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
    } catch {
      skippedFiles.push(file);
      return {};
    }
  };

  // Named constants like small_privilege_target_satisfaction = 0.025.
  // Only plain numbers resolve; computed script values stay unresolved.
  const scriptValues = new Map<string, number>();
  for (const dir of ["main_menu/common/script_values", "in_game/common/script_values"]) {
    for (const file of readScriptFiles(join(installPath, dir))) {
      for (const [key, value] of Object.entries(parse(file))) {
        if (typeof value === "number") scriptValues.set(key, value);
      }
    }
  }

  const definitions = new Map<string, Record<string, unknown>>();
  for (const file of readScriptFiles(join(installPath, "main_menu/common/modifier_type_definitions"))) {
    for (const [key, value] of Object.entries(parse(file))) {
      if (value && typeof value === "object") definitions.set(key, value as Record<string, unknown>);
    }
  }

  const localized = (key: string): string => cleanText(localization.get(key)?.name ?? key, localization);
  const unresolved = new Set<string>();
  function modifierList(block: unknown): Array<[string, ModifierValue]> {
    if (!block || typeof block !== "object" || Array.isArray(block)) return [];
    const out: Array<[string, ModifierValue]> = [];
    for (const [key, raw] of Object.entries(block as Record<string, unknown>)) {
      if (typeof raw === "number" || typeof raw === "boolean") {
        out.push([key, raw]);
      } else if (typeof raw === "string") {
        if (raw === "yes" || raw === "no") out.push([key, raw === "yes"]);
        else if (scriptValues.has(raw)) out.push([key, scriptValues.get(raw)!]);
        // `*_tt` values are tooltip text keys: show their text instead.
        else if (localization.get(raw)?.name) out.push([key, localized(raw)]);
        else {
          unresolved.add(raw);
          out.push([key, raw]);
        }
      }
    }
    return out;
  }

  const policies: CountryModifiers["policies"] = {};
  for (const law of readEntries("laws")) {
    for (const [key, value] of Object.entries(law.fields)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const list = modifierList((value as Record<string, unknown>).country_modifier);
      if (list.length > 0) policies[key] = list;
    }
  }
  const privileges: CountryModifiers["privileges"] = {};
  for (const e of readEntries("estate_privileges")) {
    const list = modifierList(e.fields.country_modifier);
    if (list.length > 0) privileges[e.key] = list;
  }

  const used = new Set([...Object.values(policies), ...Object.values(privileges)].flat().map(([key]) => key));
  const modifierTypes: Record<string, ModifierType> = {};
  for (const key of [...used].sort()) {
    const def = definitions.get(key) ?? {};
    const nameKey = `MODIFIER_TYPE_NAME_${key}`;
    const type: ModifierType = { name: (localization.get(nameKey)?.name && localized(nameKey)) || humanize(key) };
    if (def.percent === true || def.percent === "yes") type.percent = true;
    if (def.already_percent === true || def.already_percent === "yes") type.alreadyPercent = true;
    if (def.boolean === true || def.boolean === "yes") type.boolean = true;
    if (typeof def.decimals === "number") type.decimals = def.decimals;
    if (def.color === "bad") type.bad = true;
    if (def.color === "neutral") type.neutral = true;
    modifierTypes[key] = type;
  }

  return {
    modifiers: { modifierTypes, policies: sorted(policies), privileges: sorted(privileges) },
    unresolved: [...unresolved].sort(),
    skippedFiles,
  };
}

export async function run(
  options: CliOptions,
): Promise<{ counts: Record<string, number>; outPath: string; unresolved: string[]; skippedFiles: string[] }> {
  if (!existsSync(options.installPath) || !statSync(options.installPath).isDirectory()) {
    throw new CliError(`--install path does not exist or is not a directory: ${options.installPath}`);
  }
  const localization = parseLocalization(options.installPath);
  const names = buildCountryNames(options.installPath, localization);
  const { modifiers, unresolved, skippedFiles } = await buildCountryModifiers(options.installPath, localization);
  const counts = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, Object.keys(v).length]));
  if (counts.policies === 0 || counts.governmentPowers === 0) {
    throw new CliError(
      "No policy or government power names found — is --install pointed at the game's install root (containing in_game/, main_menu/)?",
    );
  }
  mkdirSync(dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, JSON.stringify(names, null, 2) + "\n", "utf-8");
  writeFileSync(join(dirname(options.outPath), MODIFIERS_FILE), JSON.stringify(modifiers) + "\n", "utf-8");
  counts.modifierTypes = Object.keys(modifiers.modifierTypes).length;
  counts.policiesWithModifiers = Object.keys(modifiers.policies).length;
  counts.privilegesWithModifiers = Object.keys(modifiers.privileges).length;
  return { counts, outPath: options.outPath, unresolved, skippedFiles };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await run(parseArgs(process.argv.slice(2)));
    console.log(`Wrote ${result.outPath} and ${MODIFIERS_FILE}:`, result.counts);
    for (const file of result.skippedFiles) console.warn(`Skipped (unparseable): ${file}`);
    if (result.unresolved.length > 0) {
      // Shown as raw text in the app rather than dropped (constitution II).
      console.warn(`${result.unresolved.length} modifier values aren't plain numbers:`, result.unresolved.join(", "));
    }
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
