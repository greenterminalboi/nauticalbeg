// What each policy and privilege actually does (specs/018, owner request
// 2026-09-26: show the modifiers on hover and on selection). The data is
// generated from the game files by tools/country-names/generate.ts into
// countryModifiers.json (~160KB), which is loaded on demand so it only
// costs anything when the Government tab opens.
import { humanizeKey } from "./countryNames";

export interface ModifierType {
  name: string;
  percent?: boolean;
  alreadyPercent?: boolean;
  boolean?: boolean;
  decimals?: number;
  /** A higher value is worse for the country (game's color=bad). */
  bad?: boolean;
  /** Neither direction is better (game's color=neutral): never colored. */
  neutral?: boolean;
}

/** Whether an effect helps or hurts the country, as the game colors it
 * (green/red); "neutral" effects and plain-text effects stay uncolored. */
export type EffectTone = "good" | "bad" | "neutral";

export interface Effect {
  text: string;
  tone: EffectTone;
}

export type ModifierValue = number | boolean | string;

export interface ModifierLookup {
  modifierTypes: Record<string, ModifierType>;
  policies: Record<string, Array<[string, ModifierValue]>>;
  privileges: Record<string, Array<[string, ModifierValue]>>;
}

let cached: Promise<ModifierLookup> | null = null;

export function loadModifierLookup(): Promise<ModifierLookup> {
  cached ??= import("./countryModifiers.json").then((m) => m.default as unknown as ModifierLookup);
  return cached;
}

function formatNumber(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}`;
}

/** "+5% Peasants Levy Size", "+0.1 Monthly Progress to Free Subjects",
 * "Can Recruit Mercenaries". A text value (a game tooltip) is shown as-is. */
export function formatModifier(lookup: ModifierLookup, key: string, value: ModifierValue): string {
  const type = lookup.modifierTypes[key] ?? { name: humanizeKey(key) };
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? type.name : `${type.name}: No`;
  const decimals = type.decimals ?? 2;
  if (type.percent) return `${formatNumber(value * 100, decimals)}% ${type.name}`;
  if (type.alreadyPercent) return `${formatNumber(value, decimals)}% ${type.name}`;
  return `${formatNumber(value, decimals)} ${type.name}`;
}

/** The game's rule: a modifier with no color setting is better when
 * higher, a color=bad one is better when lower, a neutral one is neither.
 * An on/off modifier that's switched on counts as its positive side. */
export function modifierTone(lookup: ModifierLookup, key: string, value: ModifierValue): EffectTone {
  const type = lookup.modifierTypes[key];
  if (typeof value === "string" || type?.neutral) return "neutral";
  const direction = typeof value === "boolean" ? (value ? 1 : -1) : Math.sign(value);
  if (direction === 0) return "neutral";
  const helps = type?.bad ? direction < 0 : direction > 0;
  return helps ? "good" : "bad";
}

function effects(lookup: ModifierLookup, list: Array<[string, ModifierValue]> | undefined): Effect[] {
  return (list ?? []).map(([key, value]) => ({
    text: formatModifier(lookup, key, value),
    tone: modifierTone(lookup, key, value),
  }));
}

export function policyEffects(lookup: ModifierLookup, policyKey: string): Effect[] {
  return effects(lookup, lookup.policies[policyKey]);
}

export function privilegeEffects(lookup: ModifierLookup, privilegeKey: string): Effect[] {
  return effects(lookup, lookup.privileges[privilegeKey]);
}
