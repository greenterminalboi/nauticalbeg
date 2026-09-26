import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import type { BattleResult } from "../../battleSim/types";
import { useEChartsInstance } from "../Overview/charts/useEChartsInstance";

/** One counted run of the current matchup. */
export interface ScoredRun {
  seed: number;
  outcome: BattleResult["outcome"];
  attackerCasualties: number;
  defenderCasualties: number;
  hours: number;
}

export interface Scoreboard {
  /** hashBattleInput of the inputs these runs share; any change restarts the tally. */
  inputHash: string;
  runs: ScoredRun[];
}

/**
 * Adds a result to the tally. A result from different inputs starts a new
 * tally (runs of different setups are never mixed — constitution IV); a
 * replayed seed is the identical battle, so it's not counted twice.
 */
export function addToScoreboard(board: Scoreboard | null, r: BattleResult): { board: Scoreboard; note: string | null } {
  const run: ScoredRun = {
    seed: r.seed,
    outcome: r.outcome,
    attackerCasualties: r.perSide.attacker.casualties,
    defenderCasualties: r.perSide.defender.casualties,
    hours: r.hours,
  };
  if (!board || board.inputHash !== r.inputHash) {
    return {
      board: { inputHash: r.inputHash, runs: [run] },
      note: board && board.runs.length > 0 ? "Inputs changed since the last run, so the scores restarted." : null,
    };
  }
  if (board.runs.some((x) => x.seed === r.seed)) {
    return { board, note: `Seed ${r.seed} replays a battle already counted, so it wasn't counted again.` };
  }
  return { board: { ...board, runs: [...board.runs, run] }, note: null };
}

// Okabe-Ito, validated with the dataviz skill's palette checker for this
// app's light surface (no dark theme exists). Orange and purple sit below
// 3:1 contrast, so every slice also carries a direct text label and the
// numbers are repeated in a table (the checker's required relief).
const ATTACKER_COLOR = "#0072B2";
const DEFENDER_COLOR = "#E69F00";
const NO_WINNER_COLOR = "#CC79A7";
const SURFACE = "#fff8f5"; // --color-surface: the 2px gap between slices
const INK = "#1e1b19"; // --color-on-surface: text never wears a series color

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");

function donut(title: string, slices: { name: string; value: number; color: string }[], center: string): EChartsOption {
  const data = slices.filter((s) => s.value > 0);
  return {
    animation: false,
    title: {
      text: center,
      left: "center",
      top: "middle",
      textStyle: { fontSize: 14, fontWeight: 600, color: INK },
    },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const item = p as { name: string; value: number; percent: number };
        return `${title}<br/><b>${item.name}</b>: ${fmt(item.value)} (${Math.round(item.percent)}%)`;
      },
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: INK } },
    series: [
      {
        name: title,
        type: "pie",
        radius: ["52%", "74%"],
        center: ["50%", "46%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: SURFACE, borderWidth: 2 },
        label: {
          formatter: (p: unknown) => {
            const item = p as { name: string; percent: number };
            return `${item.name}\n${Math.round(item.percent)}%`;
          },
          color: INK,
          fontSize: 11,
        },
        labelLine: { length: 8, length2: 8 },
        data: data.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      },
    ],
  };
}

interface Props {
  board: Scoreboard;
  attackerName: string;
  defenderName: string;
  note: string | null;
  onReset: () => void;
}

/** Running score of every run of the current matchup: victories and casualties (spec FR-017). */
export function BattleScoreboard({ board, attackerName, defenderName, note, onReset }: Props) {
  const winsRef = useRef<HTMLDivElement | null>(null);
  const lossesRef = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(() => {
    const n = board.runs.length;
    const count = (o: BattleResult["outcome"]) => board.runs.filter((r) => r.outcome === o).length;
    const attackerCas = board.runs.reduce((s, r) => s + r.attackerCasualties, 0);
    const defenderCas = board.runs.reduce((s, r) => s + r.defenderCasualties, 0);
    return {
      n,
      attackerWins: count("attacker"),
      defenderWins: count("defender"),
      noWinner: count("draw") + count("unresolved"),
      attackerCas,
      defenderCas,
      avgHours: n > 0 ? board.runs.reduce((s, r) => s + r.hours, 0) / n : 0,
    };
  }, [board]);

  const winsOption = useMemo(
    () =>
      donut(
        "Victories",
        [
          { name: attackerName, value: stats.attackerWins, color: ATTACKER_COLOR },
          { name: defenderName, value: stats.defenderWins, color: DEFENDER_COLOR },
          { name: "No winner", value: stats.noWinner, color: NO_WINNER_COLOR },
        ],
        `${stats.n} ${stats.n === 1 ? "run" : "runs"}`,
      ),
    [stats, attackerName, defenderName],
  );
  const lossesOption = useMemo(
    () =>
      donut(
        "Casualties",
        [
          { name: attackerName, value: stats.attackerCas, color: ATTACKER_COLOR },
          { name: defenderName, value: stats.defenderCas, color: DEFENDER_COLOR },
        ],
        `${fmt(stats.attackerCas + stats.defenderCas)} men`,
      ),
    [stats, attackerName, defenderName],
  );
  useEChartsInstance(winsRef, winsOption);
  useEChartsInstance(lossesRef, lossesOption);

  const avg = (total: number) => (stats.n > 0 ? fmt(total / stats.n) : "0");

  return (
    <section className="battle-score" aria-label="Scoreboard">
      <header className="battle-score__header">
        <div>
          <p className="battle-result__eyebrow">Simulated · across every run of this matchup</p>
          <h3 className="battle-score__title">Scoreboard</h3>
        </div>
        <button type="button" className="battle-score__reset" onClick={onReset}>
          Reset scores
        </button>
      </header>
      {note && (
        <p className="battle-score__note" role="status">
          {note}
        </p>
      )}
      <div className="battle-score__charts">
        <figure className="battle-score__figure">
          <figcaption className="battle-score__caption">Victories</figcaption>
          <div
            ref={winsRef}
            className="battle-score__chart"
            role="img"
            aria-label={`Victories over ${stats.n} ${stats.n === 1 ? "run" : "runs"}: ${attackerName} ${stats.attackerWins}, ${defenderName} ${stats.defenderWins}, no winner ${stats.noWinner}`}
          />
        </figure>
        <figure className="battle-score__figure">
          <figcaption className="battle-score__caption">Casualties (all runs)</figcaption>
          <div
            ref={lossesRef}
            className="battle-score__chart"
            role="img"
            aria-label={`Casualties over ${stats.n} ${stats.n === 1 ? "run" : "runs"}: ${attackerName} ${fmt(stats.attackerCas)}, ${defenderName} ${fmt(stats.defenderCas)}`}
          />
        </figure>
      </div>
      <div className="battle-result__table-scroll">
        <table className="battle-result__table battle-result__table--compact">
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col">Victories</th>
              <th scope="col">Win rate</th>
              <th scope="col">Total casualties</th>
              <th scope="col">Average per run</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{attackerName} (attacker)</th>
              <td>{stats.attackerWins}</td>
              <td>{pct(stats.attackerWins, stats.n)}</td>
              <td>{fmt(stats.attackerCas)}</td>
              <td>{avg(stats.attackerCas)}</td>
            </tr>
            <tr>
              <th scope="row">{defenderName} (defender)</th>
              <td>{stats.defenderWins}</td>
              <td>{pct(stats.defenderWins, stats.n)}</td>
              <td>{fmt(stats.defenderCas)}</td>
              <td>{avg(stats.defenderCas)}</td>
            </tr>
            <tr>
              <th scope="row">No winner (draw or unresolved)</th>
              <td>{stats.noWinner}</td>
              <td>{pct(stats.noWinner, stats.n)}</td>
              <td colSpan={2}>Average battle length: {(stats.avgHours / 24).toFixed(1)} days</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="battle-result__note">
        Casualty totals inherit the simulator's known casualty gap (roughly 10–17× below recorded battles; ledger U-01, U-03,
        U-49). Win rates are the more trustworthy figure.
      </p>
    </section>
  );
}
