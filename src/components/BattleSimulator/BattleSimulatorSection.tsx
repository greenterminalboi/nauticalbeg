import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattleSimRequest, BattleSimResponse } from "../../battleSim/battleSim.worker";
import { simulateBattle, validateBattleInput } from "../../battleSim/engine";
import { randomSeed } from "../../battleSim/rng";
import type { BattleInput, BattleResult } from "../../battleSim/types";
import type { SaveDatabase } from "../../storage/db";
import type { ArmyListItem } from "../../storage/queries";
import { loadLeaderboardCountries, type LeaderboardCountry } from "../Overview/leaderboardData";
import { BattleConditionsBar, defaultConditions, toConditions, type ConditionsDraft } from "./BattleConditionsBar";
import { BattleResultPanel } from "./BattleResultPanel";
import { addToScoreboard, BattleScoreboard, type Scoreboard } from "./BattleScoreboard";
import { BattleSidePanel } from "./BattleSidePanel";
import { buildSideFromSave, defaultSide, listArmies, toBattleSide, type SideDraft } from "./battleSimData";
import "./BattleSimulator.css";

/** A matchup sent from another view (US4: Firepower). `id` changes per request. */
export interface BattleMatchupRequest {
  id: number;
  attackerIdx: number;
  defenderIdx: number;
}

export interface BattleSimulatorSectionProps {
  /** The loaded save's read connection, or null with no save (FR-014). */
  db: SaveDatabase | null;
  /** US4: pre-fill both sides from these nations (their largest armies). */
  matchup?: BattleMatchupRequest | null;
}

type Role = "attacker" | "defender";
const PROGRESS_DELAY_MS = 1000;

interface RunState {
  running: boolean;
  showProgress: boolean;
  hour: number;
  error: string | null;
}

/**
 * specs/019-battle-simulator: the Battle Simulator section. Two sides,
 * pre-filled from a real army when a save is loaded (US1), every input
 * editable with its source shown (US2), and a simulated result with an
 * hour-by-hour timeline (US3). The engine runs in a Web Worker
 * (contracts/worker-protocol.md); stale runs are ignored by runId.
 */
export function BattleSimulatorSection({ db, matchup = null }: BattleSimulatorSectionProps) {
  const [countries, setCountries] = useState<LeaderboardCountry[] | null>(null);
  const [sides, setSides] = useState<Record<Role, SideDraft>>({
    attacker: defaultSide("Attacker"),
    defender: defaultSide("Defender"),
  });
  const [armies, setArmies] = useState<Record<Role, ArmyListItem[] | null>>({ attacker: null, defender: null });
  const [loadingSide, setLoadingSide] = useState<Record<Role, boolean>>({ attacker: false, defender: false });
  const [conditions, setConditions] = useState<ConditionsDraft>(defaultConditions);
  const [result, setResult] = useState<{ result: BattleResult; names: [string, string] } | null>(null);
  const [run, setRun] = useState<RunState>({ running: false, showProgress: false, hour: 0, error: null });
  const [scoreboard, setScoreboard] = useState<{ board: Scoreboard; note: string | null } | null>(null);
  const recordResult = (res: BattleResult, runNames: [string, string]) => {
    setResult({ result: res, names: runNames });
    setScoreboard((prev) => addToScoreboard(prev?.board ?? null, res));
  };

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Replacing one loaded save with another resets both sides (spec edge
  // case); loading a first save keeps any manual sides until a nation is
  // picked (T029).
  const previousDb = useRef<SaveDatabase | null>(null);
  useEffect(() => {
    if (previousDb.current !== null && previousDb.current !== db) {
      setSides({ attacker: defaultSide("Attacker"), defender: defaultSide("Defender") });
      setResult(null);
      setScoreboard(null);
      setImportedFrom(null);
    }
    previousDb.current = db;
    setArmies({ attacker: null, defender: null });
    setCountries(null);
    if (!db) return;
    let cancelled = false;
    void loadLeaderboardCountries(db).then((list) => {
      if (!cancelled) setCountries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (progressTimer.current) clearTimeout(progressTimer.current);
    },
    [],
  );

  const nationName = useCallback(
    (idx: number | null, fallback: string) => {
      if (idx === null) return fallback;
      const c = countries?.find((x) => x.idx === idx);
      return c ? (c.name ?? c.tag) : fallback;
    },
    [countries],
  );

  const prefill = useCallback(
    async (role: Role, nationIdx: number, choice: number | "whole" | null) => {
      if (!db) return;
      setLoadingSide((s) => ({ ...s, [role]: true }));
      try {
        const list = await listArmies(db, nationIdx);
        setArmies((a) => ({ ...a, [role]: list }));
        // Largest army by default; whole nation when no armies are listed
        // (e.g. a kept save parsed before 019's armies table existed).
        const pick = choice ?? (list[0]?.armyIdx ?? "whole");
        const label = nationName(nationIdx, role === "attacker" ? "Attacker" : "Defender");
        const draft = await buildSideFromSave(db, nationIdx, pick, label);
        setSides((s) => ({ ...s, [role]: draft }));
      } finally {
        setLoadingSide((s) => ({ ...s, [role]: false }));
      }
    },
    [db, nationName],
  );

  // US4: apply a matchup sent from Firepower once — after the country list
  // has loaded, so both sides get their nation names.
  const appliedMatchup = useRef<number | null>(null);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!db || !countries || !matchup || appliedMatchup.current === matchup.id) return;
    appliedMatchup.current = matchup.id;
    setResult(null);
    setScoreboard(null);
    setImportedFrom(
      `Imported from Firepower: ${nationName(matchup.attackerIdx, "Attacker")} attacking ${nationName(matchup.defenderIdx, "Defender")}. ` +
        "Both sides start from each nation's largest army; pick another army or edit anything below.",
    );
    void prefill("attacker", matchup.attackerIdx, null);
    void prefill("defender", matchup.defenderIdx, null);
  }, [db, countries, matchup, nationName, prefill]);

  const input: BattleInput = useMemo(
    () => ({
      seed: 0,
      conditions: toConditions(conditions),
      attacker: toBattleSide(sides.attacker),
      defender: toBattleSide(sides.defender),
    }),
    [conditions, sides],
  );
  const issues = useMemo(() => validateBattleInput(input), [input]);
  const errors = useMemo(() => new Map(issues.map((i) => [i.path, i.message])), [issues]);

  const names: [string, string] = [
    nationName(sides.attacker.nationIdx, "Attacker"),
    nationName(sides.defender.nationIdx, "Defender"),
  ];

  const finish = (runId: number, update: Partial<RunState>) => {
    if (runId !== runIdRef.current) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    setRun((r) => ({ ...r, running: false, showProgress: false, ...update }));
  };

  function start(seed: number) {
    if (issues.length > 0) return;
    const runInput = { ...input, seed };
    const runId = ++runIdRef.current;
    const runNames = names;
    setRun({ running: true, showProgress: false, hour: 0, error: null });
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      if (runId === runIdRef.current) setRun((r) => (r.running ? { ...r, showProgress: true } : r));
    }, PROGRESS_DELAY_MS);

    if (typeof Worker === "undefined") {
      // jsdom tests have no Worker; run inline there.
      try {
        const res = simulateBattle(runInput);
        recordResult(res, runNames);
        finish(runId, {});
      } catch (e) {
        finish(runId, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../../battleSim/battleSim.worker.ts", import.meta.url), { type: "module" });
    }
    const worker = workerRef.current;
    worker.onmessage = (event: MessageEvent<BattleSimResponse>) => {
      const msg = event.data;
      if (msg.runId !== runIdRef.current) return; // stale run
      if (msg.type === "progress") setRun((r) => ({ ...r, hour: msg.hour }));
      else if (msg.type === "done") {
        recordResult(msg.result, runNames);
        finish(msg.runId, {});
      } else finish(msg.runId, { error: msg.message });
    };
    if (runId > 1) worker.postMessage({ type: "cancel", runId: runId - 1 } satisfies BattleSimRequest);
    worker.postMessage({ type: "run", runId, input: runInput } satisfies BattleSimRequest);
  }

  const blocked = issues.length > 0;
  const setSide = (role: Role) => (update: (prev: SideDraft) => SideDraft) =>
    setSides((s) => ({ ...s, [role]: update(s[role]) }));

  return (
    <div className="battle-sim">
      <header className="battle-sim__header">
        <h2 className="battle-sim__title">Battle Simulator</h2>
        <p className="battle-sim__intro">
          Pit two armies against each other in an EU5 land battle. Dice are rolled the way the game does: one d10 per
          side every 5-hour phase. {db ? "Pick a nation for each side to start from its real army." : "Load a save to start from real armies, or fill both sides in by hand."}
        </p>
      </header>

      {importedFrom && (
        <p className="battle-sim__imported" role="status">
          {importedFrom}
          <button type="button" className="battle-sim__dismiss" aria-label="Dismiss" onClick={() => setImportedFrom(null)}>
            ✕
          </button>
        </p>
      )}

      <BattleConditionsBar conditions={conditions} onChange={setConditions} />

      <div className="battle-sim__sides">
        {(["attacker", "defender"] as const).map((role) => (
          <BattleSidePanel
            key={role}
            role={role}
            draft={sides[role]}
            onChange={setSide(role)}
            errors={errors}
            countries={db ? countries : null}
            armies={armies[role]}
            loading={loadingSide[role]}
            onSelectNation={(idx) => void prefill(role, idx, null)}
            onSelectArmy={(choice) => sides[role].nationIdx !== null && void prefill(role, sides[role].nationIdx!, choice)}
            onResetSide={() => sides[role].nationIdx !== null && void prefill(role, sides[role].nationIdx!, sides[role].armyChoice)}
          />
        ))}
      </div>

      <div className="battle-sim__actions">
        <button type="button" className="battle-sim__primary" disabled={blocked || run.running} onClick={() => start(randomSeed())}>
          Simulate
        </button>
        <button type="button" disabled={blocked || run.running || !result} onClick={() => start(randomSeed())}>
          Re-roll
        </button>
        <button type="button" disabled={blocked || run.running || !result} onClick={() => result && start(result.result.seed)}>
          Replay seed{result ? ` ${result.result.seed}` : ""}
        </button>
        {blocked && (
          <p className="battle-sim__blocked" role="status">
            Can't simulate yet: {issues[0].message}
            {issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}
          </p>
        )}
        {run.showProgress && (
          <p className="battle-sim__progress" role="status">
            Simulating… hour {run.hour}
          </p>
        )}
        {run.error && (
          <p className="battle-sim__blocked" role="alert">
            Simulation failed: {run.error}
          </p>
        )}
      </div>

      {result && scoreboard && (
        <BattleScoreboard
          board={scoreboard.board}
          attackerName={result.names[0]}
          defenderName={result.names[1]}
          note={scoreboard.note}
          onReset={() => setScoreboard(null)}
        />
      )}
      {result && <BattleResultPanel result={result.result} attackerName={result.names[0]} defenderName={result.names[1]} />}
    </div>
  );
}
