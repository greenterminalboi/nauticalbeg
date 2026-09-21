# Contract: src/storage/queries.ts additions

Two new exported functions, following `listLatestNationMetricArrow`'s
existing shape (`src/storage/queries.ts:499`) exactly: Arrow-IPC return,
`country_type = 'Real'` + `locations` liveness filter, parameterized query.

> Post-ship correction (spec addendum point 7): a third function,
> `listGreatPowersArrow`, was originally added here. Removed along with
> the rest of the great-power feature per explicit user request.

```ts
/** One row per (nation_idx, axis, value) for every currently-applicable
 * axis of every real, alive country. No row means "not applicable" —
 * callers MUST NOT default a missing axis to 0 (spec FR-005). */
export async function listSocietalValuesArrow(db: SaveDatabase): Promise<ArrayBuffer>;

/** One row per real, currently-existing country with its current total
 * development (`locations.development` summed by owner — the real
 * figure, not a fabricated composite of unrelated metrics). Discovered
 * during implementation: no existing "total development" metric lived
 * in `nation_history` (only population/tax_base/economical_base), so
 * this is a third, analogous query rather than reusing
 * `listLatestNationMetricArrow`. */
export async function listNationTotalDevelopmentArrow(db: SaveDatabase): Promise<ArrayBuffer>;
```

**Caller contract**: the frontend combines `listSocietalValuesArrow`'s rows
with `axis_config.json` to compute each country's Country Compass Position
(data-model.md) — this computation (normalization, vector sum, mean-vector
division) happens in the frontend/service layer, never inside the SQL query,
per research.md's "normalize only at the point of use" decision.
