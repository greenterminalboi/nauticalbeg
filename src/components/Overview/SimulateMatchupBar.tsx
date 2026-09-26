import { useEffect, useState } from "react";
import type { LeaderboardCountry } from "./leaderboardData";

export interface BattleMatchup {
  attackerIdx: number;
  defenderIdx: number;
}

interface Props {
  /** The countries currently selected in Firepower, in selection order. */
  countries: readonly LeaderboardCountry[];
  onSimulate: (matchup: BattleMatchup) => void;
}

const label = (c: LeaderboardCountry) => c.name ?? c.tag;

/**
 * specs/019-battle-simulator User Story 4: send two of Firepower's selected
 * countries to the Battle Simulator as attacker and defender. Defaults to
 * the first two selected; any two different selected countries can be
 * chosen, and the sides can be swapped.
 */
export function SimulateMatchupBar({ countries, onSimulate }: Props) {
  const [attackerIdx, setAttackerIdx] = useState<number | null>(countries[0]?.idx ?? null);
  const [defenderIdx, setDefenderIdx] = useState<number | null>(countries[1]?.idx ?? null);

  // Keep both picks pointing at currently selected countries.
  useEffect(() => {
    const ids = countries.map((c) => c.idx);
    setAttackerIdx((a) => (a !== null && ids.includes(a) ? a : (ids[0] ?? null)));
    setDefenderIdx((d) => (d !== null && ids.includes(d) ? d : (ids.find((i) => i !== ids[0]) ?? null)));
  }, [countries]);

  const valid = attackerIdx !== null && defenderIdx !== null && attackerIdx !== defenderIdx;

  const picker = (role: string, value: number | null, onChange: (idx: number) => void) => (
    <label className="simulate-matchup__pick">
      <span className="simulate-matchup__role">{role}</span>
      <select value={value ?? ""} aria-label={role} onChange={(e) => onChange(Number(e.target.value))}>
        {countries.map((c) => (
          <option key={c.idx} value={c.idx}>
            {label(c)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="simulate-matchup" role="group" aria-label="Simulate a battle">
      <span className="simulate-matchup__title">Simulate a battle</span>
      {picker("Attacker", attackerIdx, setAttackerIdx)}
      <button
        type="button"
        className="simulate-matchup__swap"
        aria-label="Swap attacker and defender"
        onClick={() => {
          setAttackerIdx(defenderIdx);
          setDefenderIdx(attackerIdx);
        }}
      >
        ⇄
      </button>
      {picker("Defender", defenderIdx, setDefenderIdx)}
      <button
        type="button"
        className="simulate-matchup__go"
        disabled={!valid}
        onClick={() => valid && onSimulate({ attackerIdx: attackerIdx!, defenderIdx: defenderIdx! })}
      >
        Open in Battle Simulator →
      </button>
      {!valid && <span className="simulate-matchup__hint">Pick two different countries.</span>}
    </div>
  );
}
