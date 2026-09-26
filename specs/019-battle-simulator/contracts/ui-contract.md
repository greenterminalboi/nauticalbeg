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
- **Firepower handoff (US4, FR-016)**: Factbook → Firepower → Army Stats
  shows a "Simulate a battle" bar once ≥2 countries are selected. It has
  attacker and defender picks, a swap, and "Open in Battle Simulator →".
  Sending switches to this section, pre-fills both sides from the
  nations' largest armies, and shows a dismissible "Imported from
  Firepower" note.
- **State survives navigation**: after its first visit the section stays
  mounted (hidden when inactive), so sides, conditions, and the last
  result persist across section switches until a different save loads.
- **Scoreboard (FR-017)**: above the latest result, a "Scoreboard"
  (labelled simulated) with a victories donut, a casualties donut, and a
  numbers table. It accumulates across Simulate/Re-roll runs of the same
  inputs. Changing any input restarts it with a note, replaying a seed
  isn't counted twice, and **Reset scores** clears it.
