# Phase 1 Data Model: Societal Values Compass

## Country Axis Reading (stored: `nation_societal_values`)

One country's raw measured value for one axis, as of the loaded save's
current date. Corresponds to spec Key Entity "Country Axis Reading".

| Field        | Type    | Notes                                                          |
|--------------|---------|-----------------------------------------------------------------|
| `nation_idx` | INTEGER | Foreign key to `nations`.                                       |
| `axis`       | TEXT    | One of the 14 axis keys included in the compass (e.g. `centralization_vs_decentralization`). |
| `value`      | DOUBLE  | Raw reading, roughly -100..+100. Positive pole per axis definition. |

**Validation / state rule**: a row's absence for a given `(nation_idx, axis)`
pair *is* the "not applicable" state (spec FR-005). The raw `-999` sentinel
is never stored (research.md). No row ever holds a placeholder zero.

**Relationships**: many rows per `nation_idx` (up to 14); many rows per
`axis` (one per country where applicable).

> **Removed post-ship** (spec addendum point 7): a "Great Power Status"
> entity (`great_powers` table, from `great_power_manager.members`) was
> originally here. The user asked for great-power status to be dropped
> from this feature entirely; it no longer exists anywhere in the
> implementation.

## Societal Value Axis (config, not persisted: `axisConfig.json`)

Corresponds to spec Key Entity "Societal Value Axis" and the FR-003
deliverable. Not database-backed — a static configuration asset loaded by
the frontend.

| Field                 | Type   | Notes                                                     |
|-----------------------|--------|-------------------------------------------------------------|
| `axis`                | string | Matches the `axis` values used in `nation_societal_values`.  |
| `angle_degrees`       | number | Placement angle for the positive pole; negative pole is `angle_degrees + 180`. |
| `positive_pole_label` | string | Display name for the +1 pole.                                |
| `negative_pole_label` | string | Display name for the -1 pole.                                |
| `band`                | string | Which of the four quadrant bands this axis's positive pole belongs to (informational; the angle is authoritative). |

Fourteen entries: the 13 axes from the spec's source list plus
`latinization_vs_hellenization` (spec FR-002, FR-016), each with a fixed
angle. No `gating_condition` field is needed (research.md: the sentinel
already encodes applicability; the config doesn't need to know why).

## Country Compass Position (derived, not persisted)

Corresponds to spec Key Entity "Country Compass Position". Computed at
query/render time from a country's Country Axis Reading rows and the
Societal Value Axis config — never stored, since it's fully derived and
would go stale the moment the underlying readings changed.

| Field        | Type   | Notes                                                             |
|--------------|--------|---------------------------------------------------------------------|
| `nation_idx` | INTEGER| The country this position belongs to.                                |
| `x`, `y`     | number | `mean over applicable axes i of normalize(value_i) * (cos(angle_i), -sin(angle_i))` (spec §5, FR-006: mean vector, not raw sum). `y` is negated relative to the raw unit circle — post-ship correction, spec addendum point 6 — so the corrected quadrant reading (Authoritarian Right top-right, etc.) is true of the math, not just label text. |
| `axis_count` | number | How many axes were applicable/used — needed to distinguish "zero applicable axes" (no dot, or explicit no-data marker) from "axes summed near zero" (spec Edge Cases). |

**State rule**: a country with `axis_count == 0` is not a real Country
Compass Position — per FR-015 / Edge Cases, it must not be plotted as if it
were a genuinely centrist country.
