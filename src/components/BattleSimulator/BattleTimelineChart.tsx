import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import type { BattleResult } from "../../battleSim/types";
import { useEChartsInstance } from "../Overview/charts/useEChartsInstance";

// Okabe-Ito blue/orange — the colorblind-safe pair this app already uses
// (SocietalCompassChart); attacker/defender also differ by line style
// (constitution VI), so color is never the only cue.
const ATTACKER_COLOR = "rgb(0, 114, 178)";
const DEFENDER_COLOR = "rgb(230, 159, 0)";

interface Props {
  result: BattleResult;
  attackerName: string;
  defenderName: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Strength and morale per hour, with bombard and 5-hour phase bands and each phase's dice (spec US3). */
export function BattleTimelineChart({ result, attackerName, defenderName }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const option = useMemo<EChartsOption>(() => {
    const hours = result.timeline.map((s) => s.hour);
    const phaseAt = (hour: number) => {
      let current = result.phases[0];
      for (const p of result.phases) if (p.startHour < hour) current = p;
      return current;
    };
    const bands = result.phases.map((p, i) => {
      const end = result.phases[i + 1]?.startHour ?? result.hours;
      return [
        {
          xAxis: p.startHour,
          name: p.kind === "bombard" ? `Bombard ${p.attackerEffective}–${p.defenderEffective}` : `${p.attackerRoll}–${p.defenderRoll}`,
          itemStyle: {
            color: p.kind === "bombard" ? "rgba(120,120,120,0.18)" : i % 2 === 0 ? "rgba(120,120,120,0.07)" : "rgba(0,0,0,0)",
          },
        },
        { xAxis: end },
      ];
    });
    return {
      animation: false,
      grid: { left: 64, right: 64, top: 48, bottom: 56 },
      legend: { top: 0 },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const list = params as { axisValue: number }[];
          const hour = Number(list[0]?.axisValue ?? 0);
          const sample = result.timeline.find((s) => s.hour === hour);
          if (!sample) return "";
          const p = phaseAt(hour);
          const side = (name: string, s: typeof sample.attacker, roll: number, eff: number) =>
            `<b>${name}</b>: ${fmt(s.strength)} men, morale ${s.moralePct.toFixed(1)}%, lost ${fmt(s.casualtiesThisHour)} this hour, ` +
            `${s.engaged} engaged / ${s.reserves} in reserve, dice ${roll} → ${eff}`;
          return [
            `Hour ${hour} (day ${(hour / 24).toFixed(1)}) · ${p.kind === "bombard" ? "bombard" : `phase ${p.index + 1}`}`,
            side(attackerName, sample.attacker, p.attackerRoll, p.attackerEffective),
            side(defenderName, sample.defender, p.defenderRoll, p.defenderEffective),
          ].join("<br/>");
        },
      },
      xAxis: { type: "category", data: hours, name: "Hour", nameLocation: "middle", nameGap: 32 },
      yAxis: [
        { type: "value", name: "Men", axisLabel: { formatter: (v: number) => fmt(v) } },
        { type: "value", name: "Morale %", min: 0, max: 100, splitLine: { show: false } },
      ],
      series: [
        {
          name: `${attackerName} strength`,
          type: "line",
          showSymbol: false,
          data: result.timeline.map((s) => s.attacker.strength),
          lineStyle: { color: ATTACKER_COLOR, width: 2 },
          itemStyle: { color: ATTACKER_COLOR },
          markArea: { silent: true, label: { position: "insideTop", fontSize: 10 }, data: bands as never },
        },
        {
          name: `${defenderName} strength`,
          type: "line",
          showSymbol: false,
          data: result.timeline.map((s) => s.defender.strength),
          lineStyle: { color: DEFENDER_COLOR, width: 2, type: "dashed" },
          itemStyle: { color: DEFENDER_COLOR },
        },
        {
          name: `${attackerName} morale`,
          type: "line",
          yAxisIndex: 1,
          showSymbol: false,
          data: result.timeline.map((s) => s.attacker.moralePct),
          lineStyle: { color: ATTACKER_COLOR, width: 1, type: "dotted" },
          itemStyle: { color: ATTACKER_COLOR },
        },
        {
          name: `${defenderName} morale`,
          type: "line",
          yAxisIndex: 1,
          showSymbol: false,
          data: result.timeline.map((s) => s.defender.moralePct),
          lineStyle: { color: DEFENDER_COLOR, width: 1, type: [2, 6] },
          itemStyle: { color: DEFENDER_COLOR },
        },
      ],
    };
  }, [result, attackerName, defenderName]);

  useEChartsInstance(containerRef, option);
  return (
    <div
      ref={containerRef}
      className="battle-timeline"
      role="img"
      aria-label={`Timeline of ${attackerName} versus ${defenderName}: strength and morale per hour over ${result.hours} hours`}
    />
  );
}
