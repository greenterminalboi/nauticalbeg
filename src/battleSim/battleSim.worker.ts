/// <reference lib="webworker" />
// Runs the battle engine off the main thread (specs/019-battle-simulator
// contracts/worker-protocol.md; constitution V), following
// src/share/compress.worker.ts. The engine is synchronous, so a `cancel`
// can't interrupt a run in progress — it only stops that run's messages
// from being posted; the UI also drops any message whose runId is stale.
import { simulateBattle } from "./engine";
import type { BattleInput, BattleResult } from "./types";

export type BattleSimRequest = { type: "run"; runId: number; input: BattleInput } | { type: "cancel"; runId: number };
export type BattleSimResponse =
  | { type: "progress"; runId: number; hour: number }
  | { type: "done"; runId: number; result: BattleResult }
  | { type: "error"; runId: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<number>();

ctx.onmessage = (event: MessageEvent<BattleSimRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.runId);
    return;
  }
  const { runId, input } = msg;
  try {
    const result = simulateBattle(input, (hour) => {
      if (!cancelled.has(runId)) ctx.postMessage({ type: "progress", runId, hour } satisfies BattleSimResponse);
    });
    if (!cancelled.has(runId)) ctx.postMessage({ type: "done", runId, result } satisfies BattleSimResponse);
  } catch (e) {
    if (!cancelled.has(runId)) {
      ctx.postMessage({ type: "error", runId, message: e instanceof Error ? e.message : String(e) } satisfies BattleSimResponse);
    }
  } finally {
    cancelled.delete(runId);
  }
};
