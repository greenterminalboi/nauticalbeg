import { useEffect, useState } from "react";
import { listNationLaws, listNationPrivileges, type NationLaw, type NationPrivilege } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { estateName, lawName, policyName, privilegeEstate, privilegeName } from "./countryNames";
import { loadModifierLookup, policyEffects, privilegeEffects, type Effect, type ModifierLookup } from "./countryModifiers";
import { HoverTooltip } from "./HoverTooltip";
import "./GovernmentTab.css";

interface GovernmentTabProps {
  db: SaveDatabase;
  nationIdx: number;
  /** Hover tooltips on names plus the pinned Effects side panel. Off by
   * default since the Modifiers column shows the same effects (owner
   * decision 2026-09-26: turned off, not removed). */
  interactiveEffects?: boolean;
}

type GovernmentView = "policies" | "privileges";

const VIEWS: Array<{ id: GovernmentView; label: string }> = [
  { id: "policies", label: "Policies" },
  { id: "privileges", label: "Estate Privileges" },
];

/** The game's own estate order; privileges of an unknown estate go last. */
const ESTATE_ORDER = [
  "crown_estate",
  "nobles_estate",
  "clergy_estate",
  "burghers_estate",
  "peasants_estate",
  "dhimmi_estate",
  "tribes_estate",
  "cossacks_estate",
];
function estateRank(estate: string | null): number {
  if (estate === null) return ESTATE_ORDER.length + 1;
  const i = ESTATE_ORDER.indexOf(estate);
  return i === -1 ? ESTATE_ORDER.length : i;
}

/** Privileges grouped by estate (owner request 2026-09-26: one row group
 * per estate), in the game's estate order, each group sorted by name.
 * `null` collects privileges with no known estate. */
function groupPrivileges(privileges: readonly NationPrivilege[]): Array<[string | null, NationPrivilege[]]> {
  const groups = new Map<string | null, NationPrivilege[]>();
  for (const p of privileges) {
    const estate = privilegeEstate(p.object);
    groups.set(estate, [...(groups.get(estate) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => estateRank(a) - estateRank(b) || (a ?? "").localeCompare(b ?? ""))
    .map(([estate, list]) => [estate, list.sort((x, y) => privilegeName(x.object).localeCompare(privilegeName(y.object)))]);
}

interface Selection {
  kind: "policy" | "privilege";
  key: string;
}

function effectsOf(lookup: ModifierLookup | null, selection: Selection): Effect[] | null {
  if (!lookup) return null;
  return selection.kind === "policy" ? policyEffects(lookup, selection.key) : privilegeEffects(lookup, selection.key);
}

const TONE_LABEL: Record<Effect["tone"], string | null> = { good: "helps", bad: "hurts", neutral: null };

/** Effects colored the way the game colors them: green when an effect
 * helps the country, red when it hurts. The sign and a screen-reader
 * label carry the same meaning, so color is never the only cue. */
function EffectList({ effects, className }: { effects: Effect[] | null; className?: string }) {
  if (effects === null) return <p className={className}>Loading effects…</p>;
  if (effects.length === 0) return <p className={className}>No listed effects.</p>;
  return (
    <ul className={className ? `government-tab__effect-list ${className}` : "government-tab__effect-list"}>
      {effects.map((effect, i) => (
        <li key={i} className={`government-tab__effect government-tab__effect--${effect.tone}`}>
          {effect.text}
          {TONE_LABEL[effect.tone] && <span className="government-tab__sr-only"> ({TONE_LABEL[effect.tone]})</span>}
        </li>
      ))}
    </ul>
  );
}

/** A policy or privilege name: hover shows its effects, click (or Enter)
 * pins them in the Effects panel. */
function EffectButton({
  label,
  selection,
  selected,
  lookup,
  onSelect,
}: {
  label: string;
  selection: Selection;
  selected: boolean;
  lookup: ModifierLookup | null;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <HoverTooltip content={<EffectList effects={effectsOf(lookup, selection)} className="government-tab__effect-list--tooltip" />}>
      <button
        type="button"
        className={selected ? "government-tab__item government-tab__item--selected" : "government-tab__item"}
        aria-pressed={selected}
        onClick={() => onSelect(selection)}
      >
        {label}
      </button>
    </HoverTooltip>
  );
}

/**
 * Factbook → Countries → Government (specs/018 US6): two sub-tabs, the
 * nation's laws in force (Policies) and the privileges it has granted its
 * estates. Each row lists what the policy or privilege does in a Modifiers
 * column, colored green/red the way the game does (countryModifiers.json).
 * Names come from the game's own text (countryNames.json).
 */
export function GovernmentTab({ db, nationIdx, interactiveEffects = false }: GovernmentTabProps) {
  const [data, setData] = useState<{ idx: number; laws: NationLaw[]; privileges: NationPrivilege[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ModifierLookup | null>(null);
  const [view, setView] = useState<GovernmentView>("policies");
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadModifierLookup()
      .then((loaded) => {
        if (!cancelled) setLookup(loaded);
      })
      .catch(() => {
        // Names still show; the Modifiers column keeps saying "Loading effects…".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSelection(null);
    Promise.all([listNationLaws(db, nationIdx), listNationPrivileges(db, nationIdx)])
      .then(([laws, privileges]) => {
        if (!cancelled) setData({ idx: nationIdx, laws, privileges });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load government data.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, nationIdx]);

  if (error) return <p role="alert">{error}</p>;
  if (!data || data.idx !== nationIdx) return <p>Loading government…</p>;

  const laws = [...data.laws].sort((a, b) => lawName(a.lawCategory).localeCompare(lawName(b.lawCategory)));
  const privilegeGroups = groupPrivileges(data.privileges);
  const isSelected = (kind: Selection["kind"], key: string) => selection?.kind === kind && selection.key === key;
  const selectedEffects = selection ? effectsOf(lookup, selection) : null;
  const selectedName = selection
    ? selection.kind === "policy"
      ? policyName(selection.key)
      : privilegeName(selection.key)
    : null;

  function nameCell(label: string, item: Selection) {
    if (!interactiveEffects) return label;
    return (
      <EffectButton
        label={label}
        selection={item}
        selected={isSelected(item.kind, item.key)}
        lookup={lookup}
        onSelect={setSelection}
      />
    );
  }

  return (
    <div className={interactiveEffects ? "government-tab government-tab--with-panel" : "government-tab"}>
      <div className="government-tab__lists">
        <div className="government-tab__views" role="group" aria-label="Government view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={v.id === view ? "government-tab__view government-tab__view--active" : "government-tab__view"}
              aria-pressed={v.id === view}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "policies" && (
          <section className="government-tab__section" aria-labelledby="government-policies">
            <h2 id="government-policies" className="government-tab__heading">
              Policies
            </h2>
            {laws.length === 0 ? (
              <p>No laws recorded for this nation.</p>
            ) : (
              <table className="government-tab__table">
                <thead>
                  <tr>
                    <th scope="col">Law</th>
                    <th scope="col">Policy</th>
                    <th scope="col">Modifiers</th>
                    <th scope="col">Enacted</th>
                  </tr>
                </thead>
                <tbody>
                  {laws.map((law) => (
                    <tr key={law.lawCategory}>
                      <td>{lawName(law.lawCategory)}</td>
                      <td>{nameCell(policyName(law.object), { kind: "policy", key: law.object })}</td>
                      <td>
                        <EffectList effects={lookup ? policyEffects(lookup, law.object) : null} />
                      </td>
                      <td className="government-tab__date">{law.date ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {view === "privileges" && (
          <section className="government-tab__section" aria-labelledby="government-privileges">
            <h2 id="government-privileges" className="government-tab__heading">
              Estate Privileges
            </h2>
            {privilegeGroups.length === 0 ? (
              <p>No estate privileges granted.</p>
            ) : (
              <table className="government-tab__table">
                <thead>
                  <tr>
                    <th scope="col">Estate</th>
                    <th scope="col">Privilege</th>
                    <th scope="col">Modifiers</th>
                    <th scope="col">Granted</th>
                  </tr>
                </thead>
                {privilegeGroups.map(([estate, list]) => (
                  // One <tbody> per estate: its name spans all its rows.
                  <tbody key={estate ?? "other"} className="government-tab__estate-group">
                    {list.map((p, i) => (
                      <tr key={p.object}>
                        {i === 0 && (
                          <th scope="rowgroup" rowSpan={list.length} className="government-tab__estate-cell">
                            {estate ? estateName(estate) : "Other"}
                          </th>
                        )}
                        <td>{nameCell(privilegeName(p.object), { kind: "privilege", key: p.object })}</td>
                        <td>
                          <EffectList effects={lookup ? privilegeEffects(lookup, p.object) : null} />
                        </td>
                        <td className="government-tab__date">{p.date ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </section>
        )}
      </div>

      {interactiveEffects && (
        <section className="government-tab__effects" aria-labelledby="government-effects">
          <h2 id="government-effects" className="government-tab__heading">
            Effects
          </h2>
          {!selection ? (
            <p className="government-tab__hint">Select a policy or privilege to see what it does.</p>
          ) : (
            <>
              <p className="government-tab__effects-name">{selectedName}</p>
              <EffectList effects={selectedEffects} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
