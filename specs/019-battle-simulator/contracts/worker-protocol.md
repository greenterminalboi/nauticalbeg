# Contract: Simulation worker protocol (`src/battleSim/battleSim.worker.ts`)

This follows the existing `src/share/compress.worker.ts` pattern. There
is one worker per simulator view, and it can be reused across runs.

## Main thread → worker
```ts
{ type: "run", runId: number, input: BattleInput }
{ type: "cancel", runId: number }
```

## Worker → main thread
```ts
{ type: "progress", runId: number, hour: number }          // at most once per phase
{ type: "done", runId: number, result: BattleResult }
{ type: "error", runId: number, message: string }           // validation or engine failure
```

## Rules
- The UI ignores messages whose `runId` isn't the latest (for example
  after a quick re-run).
- The UI shows a progress indicator only once a run has gone longer than
  one second without `done` (Constitution V).
- The worker never reads storage. `input` is fully resolved on the main
  thread.
