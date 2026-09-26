import { useState } from "react";
import { COMBAT_RULES_REFERENCE } from "../../battleSim/combatRulesReference";
import { PERCENT_SCALE } from "../../battleSim/assumedConstants";
import { ARMY_CATEGORIES, type ArmyCategory } from "../../battleSim/types";
import type { ArmyListItem } from "../../storage/queries";
import { CountrySelect } from "../Overview/CountrySelect";
import type { LeaderboardCountry } from "../Overview/leaderboardData";
import { formatUnitTypeName } from "../Overview/militaryStatFormat";
import { UNIT_TYPE_REFERENCE } from "../Overview/unitTypeReference";
import {
  armyLabel,
  defaultSide,
  edited,
  newUserRow,
  resetValue,
  type RowDraft,
  type SideDraft,
  type StatKey,
} from "./battleSimData";
import { CheckboxField, NumberField, SelectField } from "./SourcedField";

const CATEGORY_LABEL: Record<ArmyCategory, string> = {
  army_light_infantry: "Light infantry",
  army_heavy_infantry: "Heavy infantry",
  army_light_cavalry: "Light cavalry",
  army_heavy_cavalry: "Heavy cavalry",
  army_artillery: "Artillery",
  army_auxiliary: "Auxiliary",
};

/** Every land unit type, grouped by category then ordered by age. */
const UNIT_OPTIONS = Object.entries(UNIT_TYPE_REFERENCE)
  .filter(([, e]) => (ARMY_CATEGORIES as readonly string[]).includes(e.category))
  .sort(
    ([a, ea], [b, eb]) =>
      ARMY_CATEGORIES.indexOf(ea.category as ArmyCategory) - ARMY_CATEGORIES.indexOf(eb.category as ArmyCategory) ||
      ea.age - eb.age ||
      a.localeCompare(b),
  )
  .map(([key, e]) => ({
    value: key,
    label: `${formatUnitTypeName(key)} (age ${e.age}${e.isLevy ? ", levy" : ""})`,
    group: CATEGORY_LABEL[e.category as ArmyCategory],
  }));

const SECTION_LABEL = { left: "Left", center: "Center", right: "Right", reserves: "Reserves" } as const;

const STAT_FIELDS: { key: StatKey; label: string; scale: number; suffix: string; step: number }[] = [
  { key: "discipline", label: "Discipline", scale: PERCENT_SCALE, suffix: "%", step: 1 },
  { key: "militaryTactics", label: "Military tactics", scale: PERCENT_SCALE, suffix: "%", step: 1 },
  { key: "landMoraleModifier", label: "Land morale modifier", scale: PERCENT_SCALE, suffix: "%", step: 1 },
  { key: "startingMoralePct", label: "Starting morale", scale: 1, suffix: "% of max", step: 1 },
  { key: "levyCombatEfficiency", label: "Levy combat efficiency", scale: PERCENT_SCALE, suffix: "%", step: 1 },
  { key: "armyInitiative", label: "Army initiative", scale: PERCENT_SCALE, suffix: "%", step: 1 },
];

const TRAIT_OPTIONS = [
  { value: null as string | null, label: "No general trait" },
  ...Object.entries(COMBAT_RULES_REFERENCE.generalTraits).map(([key, mods]) => {
    const dice = mods.commander_combat_bonus;
    const extras = Object.keys(mods).filter((m) => m !== "commander_combat_bonus").length;
    const bits = [dice ? `${dice > 0 ? "+" : ""}${dice} dice` : null, extras ? `${extras} other modifier${extras > 1 ? "s" : ""}` : null].filter(Boolean);
    return { value: key as string | null, label: `${formatUnitTypeName(key)}${bits.length ? ` (${bits.join(", ")})` : ""}` };
  }),
];

interface Props {
  role: "attacker" | "defender";
  draft: SideDraft;
  /** Receives an updater so rapid successive edits never read a stale draft. */
  onChange: (update: (prev: SideDraft) => SideDraft) => void;
  /** Validation messages keyed by path (e.g. "attacker.composition[0].count"). */
  errors: Map<string, string>;
  /** null in no-save mode (FR-014): nation/army pickers hidden. */
  countries: LeaderboardCountry[] | null;
  armies: ArmyListItem[] | null;
  loading: boolean;
  onSelectNation: (idx: number) => void;
  onSelectArmy: (choice: number | "whole") => void;
  /** Re-runs the save pre-fill for the current nation/army. */
  onResetSide: () => void;
}

export function BattleSidePanel({
  role,
  draft,
  onChange,
  errors,
  countries,
  armies,
  loading,
  onSelectNation,
  onSelectArmy,
  onResetSide,
}: Props) {
  const [addType, setAddType] = useState(UNIT_OPTIONS[0]?.value ?? "");
  const title = role === "attacker" ? "Attacker" : "Defender";
  const err = (path: string) => errors.get(`${role}.${path}`);

  const setRow = (i: number, row: RowDraft) => onChange((d) => ({ ...d, rows: d.rows.map((r, j) => (j === i ? row : r)) }));
  const setStat = (key: StatKey, v: ReturnType<typeof edited<number>>) => onChange((d) => ({ ...d, stats: { ...d.stats, [key]: v } }));
  const setPower = (c: ArmyCategory, v: ReturnType<typeof edited<number>>) => onChange((d) => ({ ...d, power: { ...d.power, [c]: v } }));

  return (
    <section className={`battle-side battle-side--${role}`} aria-label={title}>
      <header className="battle-side__header">
        <h3 className="battle-side__title">{title}</h3>
        <button
          type="button"
          className="battle-side__reset"
          onClick={() => (draft.nationIdx !== null ? onResetSide() : onChange(() => defaultSide(draft.label)))}
        >
          Reset side
        </button>
      </header>

      {countries && (
        <div className="battle-side__pickers">
          <CountrySelect
            countries={countries}
            selectedIdx={draft.nationIdx}
            onSelect={onSelectNation}
            placeholder={`Choose the ${role}…`}
          />
          {draft.nationIdx !== null && armies && (
            <label className="battle-side__army">
              <span className="sourced-field__label">Army</span>
              <select
                value={draft.armyChoice === null ? "" : String(draft.armyChoice)}
                onChange={(e) => onSelectArmy(e.target.value === "whole" ? "whole" : Number(e.target.value))}
              >
                {armies.map((a, i) => (
                  <option key={a.armyIdx} value={a.armyIdx}>
                    {armyLabel(a, i)}
                  </option>
                ))}
                <option value="whole">Whole nation (every land regiment)</option>
              </select>
            </label>
          )}
          {draft.nationIdx !== null && armies && armies.length === 0 && (
            <p className="battle-side__note">No land regiments listed as armies for this nation.</p>
          )}
        </div>
      )}
      {!countries && <p className="battle-side__note">No save loaded — fill in this side by hand.</p>}
      {loading && <p className="battle-side__note">Loading army…</p>}
      {draft.notes.map((n) => (
        <p key={n} className="battle-side__note">
          {n}
        </p>
      ))}

      <h4 className="battle-side__subtitle">Regiments</h4>
      {err("composition") && <p className="sourced-field__error">{err("composition")}</p>}
      <div className="battle-side__table-scroll">
        <table className="battle-side__table">
          <thead>
            <tr>
              <th>Unit type</th>
              <th>Count</th>
              <th>Strength %</th>
              <th>Levy</th>
              <th>Experience</th>
              <th>Section</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, i) => (
              <tr key={row.id}>
                <td>
                  <SelectField
                    compact
                    label="Unit type"
                    field={row.unitType}
                    options={UNIT_OPTIONS}
                    error={err(`composition[${i}].unitType`)}
                    onChange={(v) => setRow(i, { ...row, unitType: edited(row.unitType, v) })}
                    onReset={() => setRow(i, { ...row, unitType: resetValue(row.unitType) })}
                  />
                </td>
                <td>
                  <NumberField
                    compact
                    label="Count"
                    field={row.count}
                    error={err(`composition[${i}].count`)}
                    onChange={(v) => setRow(i, { ...row, count: edited(row.count, v) })}
                    onReset={() => setRow(i, { ...row, count: resetValue(row.count) })}
                  />
                </td>
                <td>
                  <NumberField
                    compact
                    label="Strength %"
                    field={row.strengthPct}
                    error={err(`composition[${i}].strengthPct`)}
                    onChange={(v) => setRow(i, { ...row, strengthPct: edited(row.strengthPct, v) })}
                    onReset={() => setRow(i, { ...row, strengthPct: resetValue(row.strengthPct) })}
                  />
                </td>
                <td>
                  <CheckboxField
                    label="Levy"
                    field={row.isLevy}
                    onChange={(v) => setRow(i, { ...row, isLevy: edited(row.isLevy, v) })}
                    onReset={() => setRow(i, { ...row, isLevy: resetValue(row.isLevy) })}
                  />
                </td>
                <td>
                  <NumberField
                    compact
                    label="Experience"
                    field={row.experience}
                    step={0.1}
                    error={err(`composition[${i}].experience`)}
                    onChange={(v) => setRow(i, { ...row, experience: edited(row.experience, v) })}
                    onReset={() => setRow(i, { ...row, experience: resetValue(row.experience) })}
                  />
                </td>
                <td className="battle-side__section">{row.section ? SECTION_LABEL[row.section] : "By formation"}</td>
                <td>
                  <button
                    type="button"
                    className="battle-side__remove"
                    aria-label={`Remove ${formatUnitTypeName(row.unitType.value)} row`}
                    onClick={() => onChange((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="battle-side__add">
        <select value={addType} aria-label="Unit type to add" onChange={(e) => setAddType(e.target.value)}>
          {[...new Set(UNIT_OPTIONS.map((o) => o.group))].map((g) => (
            <optgroup key={g} label={g}>
              {UNIT_OPTIONS.filter((o) => o.group === g).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" onClick={() => onChange((d) => ({ ...d, rows: [...d.rows, newUserRow(addType)] }))}>
          Add regiments
        </button>
      </div>

      <h4 className="battle-side__subtitle">Army</h4>
      <div className="battle-side__grid">
        <SelectField
          label="Formation"
          field={draft.formation}
          options={Object.keys(COMBAT_RULES_REFERENCE.formations).map((k) => ({ value: k, label: formatUnitTypeName(k) }))}
          error={err("formation")}
          onChange={(v) => onChange((d) => ({ ...d, formation: edited(d.formation, v) }))}
          onReset={() => onChange((d) => ({ ...d, formation: resetValue(d.formation) }))}
        />
        {STAT_FIELDS.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            field={draft.stats[f.key]}
            scale={f.scale}
            suffix={f.suffix}
            step={f.step}
            error={err(`stats.${f.key}`)}
            onChange={(v) => setStat(f.key, edited(draft.stats[f.key], v))}
            onReset={() => setStat(f.key, resetValue(draft.stats[f.key]))}
          />
        ))}
      </div>
      <details className="battle-side__details">
        <summary>Unit-type power modifiers</summary>
        <div className="battle-side__grid">
          {ARMY_CATEGORIES.map((c) => (
            <NumberField
              key={c}
              label={`${CATEGORY_LABEL[c]} power`}
              field={draft.power[c]}
              scale={PERCENT_SCALE}
              suffix="%"
              error={err(`stats.power.${c}`)}
              onChange={(v) => setPower(c, edited(draft.power[c], v))}
              onReset={() => setPower(c, resetValue(draft.power[c]))}
            />
          ))}
        </div>
      </details>

      <h4 className="battle-side__subtitle">General</h4>
      <div className="battle-side__grid">
        <SelectField
          label="Trait"
          field={draft.generalTrait}
          options={TRAIT_OPTIONS}
          error={err("general.trait")}
          onChange={(v) => onChange((d) => ({ ...d, generalTrait: edited(d.generalTrait, v) }))}
          onReset={() => onChange((d) => ({ ...d, generalTrait: resetValue(d.generalTrait) }))}
        />
        <NumberField
          label="Extra dice bonus"
          field={draft.extraDiceBonus}
          error={err("general.extraDiceBonus")}
          onChange={(v) => onChange((d) => ({ ...d, extraDiceBonus: edited(d.extraDiceBonus, v) }))}
          onReset={() => onChange((d) => ({ ...d, extraDiceBonus: resetValue(d.extraDiceBonus) }))}
        />
        <div className="sourced-field">
          <span className="sourced-field__label">Military skill</span>
          <span className="battle-side__readonly">
            {draft.mil === null ? "—" : draft.mil} <span className="battle-side__muted">effect not modelled (U-38)</span>
          </span>
        </div>
      </div>
    </section>
  );
}
