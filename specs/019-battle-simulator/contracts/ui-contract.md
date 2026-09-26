# Contract: Battle Simulator UI

## Placement
- A new top-level section, `AppSection = "battle-simulator"`, with the
  nav label **Battle Simulator**. It is always reachable, with or without
  a save (FR-014).

## Layout (at desktop width; stacks vertically below about 900px)
```
┌ Battle conditions: [Topography ▾] [Vegetation ▾] [Settlement ▾] [Crossing ▾] ┐
├──────── Attacker ─────────┬───────── Defender ─────────┤
│ Nation [▾]  Army [▾]      │ Nation [▾]  Army [▾]       │  ← hidden without a save
│ Composition table         │ Composition table          │  unit type / count / strength% / levy / exp / ⟲
│ Stats (discipline, …)     │ Stats                      │  each with a source badge: save·default·edited, ⟲
│ General (trait ▾, bonus)  │ General                    │
│ [Reset side]              │ [Reset side]               │
├───────────────────────────┴────────────────────────────┤
│ [Simulate]  [Re-roll]  seed: 123456 [Replay seed]      │
├────────────────────────────────────────────────────────┤
│ SIMULATED RESULT banner: winner · reason · duration    │
│ Per-side: start → end strength, casualties, morale     │
│ Timeline chart (strength + morale, phase bands, dice)  │
│ Approximations used (collapsible list)                 │
└────────────────────────────────────────────────────────┘
```

## Behaviour
- **Source badges** (FR-004): every editable value shows `save`,
  `default`, or `edited`. `edited` values show the save value in the
  hover tooltip, using `HoverTooltip.tsx` rather than `title=`
  (FR-015).
- **Validation** (FR-011): invalid fields get an inline message, and
  Simulate is disabled with a summary of the reason ("Defender has no
  regiments").
- **Simulate** uses a fresh random seed. **Re-roll** is the same as
  Simulate with a new seed. **Replay seed** re-runs with the displayed
  seed (SC-006).
- **Result labelling** (FR-010): the result area heading reads
  "Simulated result". It is never styled like save-data panels.
- **Save change**: loading a different save resets both sides
  (spec edge case).
- **Nation without armies**: army picker shows "No land regiments", and
  the composition starts empty with that note.
