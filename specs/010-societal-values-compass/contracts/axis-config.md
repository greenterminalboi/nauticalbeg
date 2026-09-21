# Contract: axisConfig.json

Lives at `src/components/Overview/axisConfig.json`, co-located with the
compass components, following the existing `rulerNames.json` precedent
(a plain JSON module import) rather than a new `src/config/` directory.

Static config asset (FR-003's deliverable), loaded by the frontend to derive
each axis's placement angle. One entry per axis included in the compass (14
total per FR-002/FR-016). Never used by the SQL/query layer — only by the
position-computation code (data-model.md's Country Compass Position).

## Shape

```json
[
  {
    "axis": "aristocracy_vs_plutocracy",
    "angle_degrees": 20,
    "positive_pole_label": "Plutocracy",
    "negative_pole_label": "Aristocracy",
    "band": "market-libertarian"
  },
  {
    "axis": "centralization_vs_decentralization",
    "angle_degrees": 100,
    "positive_pole_label": "Decentralization",
    "negative_pole_label": "Centralization",
    "band": "libertarian-collective"
  }
]
```

- `axis` MUST exactly match a value used in `nation_societal_values.axis`
  (contracts/schema.md) and in `public/encyclopedia/societal_values.json`'s
  `key` field.
- `angle_degrees` is the positive pole's angle (0-360). The negative pole is
  implicitly `angle_degrees + 180 mod 360` — there is no separate config
  entry for it.
- Consumers (the position-computation code) MUST treat this file as the only
  source of angle assignment; angles MUST NOT be hardcoded elsewhere.

## Population rule

All 14 axes get an entry: the 13 from the spec's source list, plus
`latinization_vs_hellenization` (spec FR-016). Populating each axis's exact
`angle_degrees` within its assigned band (spec §4's four quadrant ranges) is
a `tasks.md` deliverable, not decided in this plan — including:

- `belligerent_vs_conciliatory` and `outward_vs_inward`, whose band
  placement the spec itself flags as provisional (spec Assumptions;
  SC-005 is the acceptance check for revisiting it).
- `latinization_vs_hellenization`, whose band placement was left open by the
  source material (spec Assumptions: "exact band placement to be confirmed
  during planning") — assign it during the `tasks.md` config-authoring task,
  consistent with how the other two cultural/religious-sphere axes
  (`sinicized_vs_unsinicized`, `mysticism_vs_jurisprudence`) are placed:
  wherever they most resemble, not forced into one of the four primary
  bands' named axis lists.
