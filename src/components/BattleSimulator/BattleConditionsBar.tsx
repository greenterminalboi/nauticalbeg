import { COMBAT_RULES_REFERENCE } from "../../battleSim/combatRulesReference";
import type { BattleConditions, Crossing } from "../../battleSim/types";
import { edited, resetValue, sourced, type Sourced } from "./battleSimData";
import { SelectField } from "./SourcedField";

export interface ConditionsDraft {
  topography: Sourced<string>;
  vegetation: Sourced<string | null>;
  locationRank: Sourced<string>;
  crossing: Sourced<Crossing>;
}

export function defaultConditions(): ConditionsDraft {
  return {
    topography: sourced("flatland", "default"),
    vegetation: sourced<string | null>(null, "default"),
    locationRank: sourced("rural_settlement", "default"),
    crossing: sourced<Crossing>("none", "default"),
  };
}

export function toConditions(c: ConditionsDraft): BattleConditions {
  return {
    topography: c.topography.value,
    vegetation: c.vegetation.value,
    locationRank: c.locationRank.value,
    crossing: c.crossing.value,
  };
}

const titleCase = (key: string) =>
  key
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

function terrainLabel(key: string, entry: { defenderDice: number; frontageDelta: number }): string {
  const parts: string[] = [];
  if (entry.defenderDice) parts.push(`attacker −${entry.defenderDice} dice`);
  if (entry.frontageDelta) parts.push(`frontage ${entry.frontageDelta}`);
  return parts.length ? `${titleCase(key)} (${parts.join(", ")})` : titleCase(key);
}

const C = COMBAT_RULES_REFERENCE.nCombat;
const CROSSING_OPTIONS: { value: Crossing; label: string }[] = [
  { value: "none", label: "No crossing" },
  { value: "river", label: `River crossing (attacker ${C.RIVER_CROSSING_DICE} dice)` },
  { value: "strait", label: `Strait crossing (attacker ${C.STRAIT_CROSSING_DICE} dice)` },
  { value: "sea_landing", label: `Landing from sea (attacker ${C.SEA_LANDING_DICE} dice)` },
];

interface Props {
  conditions: ConditionsDraft;
  onChange: (next: ConditionsDraft) => void;
}

/** Terrain, vegetation, settlement and crossing (spec FR-005), from the game's own tables. */
export function BattleConditionsBar({ conditions, onChange }: Props) {
  const r = COMBAT_RULES_REFERENCE;
  const set = <K extends keyof ConditionsDraft>(key: K, value: ConditionsDraft[K]) => onChange({ ...conditions, [key]: value });
  return (
    <fieldset className="battle-conditions">
      <legend className="battle-conditions__title">Battlefield</legend>
      <SelectField
        label="Topography"
        field={conditions.topography}
        options={Object.entries(r.topography).map(([k, e]) => ({ value: k, label: terrainLabel(k, e) }))}
        onChange={(v) => set("topography", edited(conditions.topography, v))}
        onReset={() => set("topography", resetValue(conditions.topography))}
      />
      <SelectField
        label="Vegetation"
        field={conditions.vegetation}
        options={[
          { value: null, label: "None" },
          ...Object.entries(r.vegetation).map(([k, e]) => ({ value: k as string | null, label: terrainLabel(k, e) })),
        ]}
        onChange={(v) => set("vegetation", edited(conditions.vegetation, v))}
        onReset={() => set("vegetation", resetValue(conditions.vegetation))}
      />
      <SelectField
        label="Settlement"
        field={conditions.locationRank}
        options={Object.entries(r.locationRanks).map(([k, e]) => ({
          value: k,
          label: e.frontageDelta ? `${titleCase(k)} (frontage ${e.frontageDelta})` : titleCase(k),
        }))}
        onChange={(v) => set("locationRank", edited(conditions.locationRank, v))}
        onReset={() => set("locationRank", resetValue(conditions.locationRank))}
      />
      <SelectField
        label="Crossing"
        field={conditions.crossing}
        options={CROSSING_OPTIONS}
        onChange={(v) => set("crossing", edited(conditions.crossing, v))}
        onReset={() => set("crossing", resetValue(conditions.crossing))}
      />
    </fieldset>
  );
}
