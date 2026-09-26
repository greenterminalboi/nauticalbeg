import { COMBAT_UNKNOWNS } from "../../battleSim/unknowns";
import type { BattleResult, SideSummary } from "../../battleSim/types";
import { BattleTimelineChart } from "./BattleTimelineChart";

const fmt = (n: number) => Math.round(n).toLocaleString();

const END_REASON: Record<BattleResult["endReason"], string> = {
  morale: "morale broke",
  stackwipe: "stackwiped",
  mutual: "both sides broke in the same hour",
  "hour-limit": "no side broke within 100 days",
};

interface Props {
  result: BattleResult;
  attackerName: string;
  defenderName: string;
}

function headline(r: BattleResult, a: string, d: string): string {
  if (r.outcome === "unresolved") return "Unresolved";
  if (r.outcome === "draw") return "Draw";
  const winner = r.outcome === "attacker" ? a : d;
  const loser = r.outcome === "attacker" ? d : a;
  return `${winner} wins — ${loser}'s ${r.endReason === "stackwipe" ? "army was stackwiped" : "morale broke"}`;
}

function SideRow({ name, s }: { name: string; s: SideSummary }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{fmt(s.startStrength)}</td>
      <td>{fmt(s.endStrength)}</td>
      <td>{fmt(s.casualties)}</td>
      <td>{s.endMoralePct.toFixed(1)}%</td>
      <td>{s.regimentsRouted}</td>
      <td>{s.regimentsDestroyed}</td>
    </tr>
  );
}

/** A simulated battle's outcome — always labelled as simulated, never styled like save data (spec FR-010). */
export function BattleResultPanel({ result, attackerName, defenderName }: Props) {
  const days = result.days;
  return (
    <section className="battle-result" aria-label="Simulated result">
      <p className="battle-result__eyebrow">Simulated result · not recorded game data</p>
      <h3 className="battle-result__headline">{headline(result, attackerName, defenderName)}</h3>
      <p className="battle-result__meta">
        {result.outcome === "draw" || result.outcome === "unresolved" ? `${END_REASON[result.endReason]} · ` : ""}
        {result.hours} hours ({days.toFixed(1)} days) · {result.phases.length} phases · seed {result.seed}
      </p>

      <div className="battle-result__table-scroll">
        <table className="battle-result__table">
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col">Start men</th>
              <th scope="col">End men</th>
              <th scope="col">Casualties</th>
              <th scope="col">End morale</th>
              <th scope="col">Regiments routed</th>
              <th scope="col">Destroyed</th>
            </tr>
          </thead>
          <tbody>
            <SideRow name={`${attackerName} (attacker)`} s={result.perSide.attacker} />
            <SideRow name={`${defenderName} (defender)`} s={result.perSide.defender} />
          </tbody>
        </table>
      </div>

      <BattleTimelineChart result={result} attackerName={attackerName} defenderName={defenderName} />

      <details className="battle-result__details">
        <summary>Dice by phase</summary>
        <div className="battle-result__table-scroll">
          <table className="battle-result__table battle-result__table--compact">
            <thead>
              <tr>
                <th scope="col">Phase</th>
                <th scope="col">Starts at hour</th>
                <th scope="col">{attackerName} roll → dice</th>
                <th scope="col">{defenderName} roll → dice</th>
              </tr>
            </thead>
            <tbody>
              {result.phases.map((p) => (
                <tr key={p.index}>
                  <td>{p.kind === "bombard" ? "Bombard" : `Combat ${p.index + (result.phases[0]?.kind === "bombard" ? 0 : 1)}`}</td>
                  <td>{p.startHour}</td>
                  <td>
                    {p.attackerRoll} → {p.attackerEffective}
                    {p.attackerUnclamped !== p.attackerEffective ? ` (raw ${p.attackerUnclamped})` : ""}
                  </td>
                  <td>
                    {p.defenderRoll} → {p.defenderEffective}
                    {p.defenderUnclamped !== p.defenderEffective ? ` (raw ${p.defenderUnclamped})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="battle-result__details" open>
        <summary>Approximations used in this run ({result.approximations.length})</summary>
        <p className="battle-result__note">
          EU5's combat rules are only partly documented. These unverified assumptions from the uncertainty ledger
          (combat-unknowns.md) affected this result:
        </p>
        <ul className="battle-result__approximations">
          {result.approximations.map((id) => {
            const u = COMBAT_UNKNOWNS[id];
            return (
              <li key={id}>
                <span className="battle-result__approx-id">{id}</span> {u ? u.title : "Unlisted assumption"}
                {u && (
                  <span className="battle-result__approx-detail">
                    {" "}
                    — assumed: {u.assumption} <span className="battle-result__approx-status">({u.status})</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
