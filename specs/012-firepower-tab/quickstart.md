# Quickstart: Validating Firepower Tab

Prerequisites: this repo's dependencies installed (`npm install`), and a
local EU5 install to generate the static reference tables against (path
per the `EU5 save format gotchas` memory) — same one-time-generation
pattern as `rgoGameColors.ts`/Encyclopedia.

## 1. Generate the static reference tables (research.md §3-5)

```bash
npx tsx tools/firepower-reference/generate.ts --install "/Users/halda/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Europa Universalis V/game"
```

Expected: `src/components/Overview/unitTypeReference.ts` (~259 entries),
`unitUnlockReference.ts` (~114 entries), and
`militaryModifierReference.ts` (all confirmed sources across discipline/
tactics/fort_limit/siege_ability/global_defensive) are written or
updated. Re-run and diff — should be byte-identical (determinism, same
convention as the Encyclopedia generator).

## 2. Confirm parser fixture coverage (Constitution Principle II)

```bash
npm test -- tests/parser/adapter.test.ts
```

Expected: the extended `tests/fixtures/rus-1628-minimal.eu5` fixture
round-trips `unit_manager`/`subunit_manager` (army + navy regiment),
`researched_advances`, `implemented_reforms`, `implemented_privileges`,
and `implemented_laws` into `regiments`/`nation_advances`/
`nation_reforms`/`nation_privileges`/`nation_laws` exactly.

## 3. Confirm the modifier/unlock reduction logic (spec FR-006, FR-007, FR-009)

```bash
npm test -- tests/storage/armyNavyStats.test.ts
```

Expected, using small fixture data: a country's discipline/tactics/
fort_limit/siege_ability/fort_defense sum only the sources actually
present in its `nation_advances`/`nation_reforms`/`nation_privileges`/
`nation_laws`/`nation_societal_values` rows against the static Modifier
Source Reference (unmatched sources contribute nothing, never an error);
a country's age-per-category is the max age among unlocked unit types for
that category, gated by `researched_advances`, not by what's currently
fielded.

## 4. Confirm the UI end-to-end against the real save

```bash
npm run dev
```

- Load the real save (`Russia (Melted).eu5` or another local save).
- Open **Factbook → Firepower**.
- **Military Doctrine**: confirm each selected country plots on the
  3-axis radar with locked axes (raw `-999`) excluded, not shown as
  centered/neutral.
- **Army Stats**: confirm regiment counts and morale match a manual spot
  check (pick one visible country, sum `subunit_manager` rows with that
  `owner` and an `a_` type prefix in the raw save, compare); confirm the
  5 computed stats show their partial-total marker (spec FR-013); confirm
  the 4 age columns show roman numerals I-VI.
- **Navy Stats**: same spot check with `n_` type prefix; confirm damage
  given/taken renders for a country with war history and is absent
  (not zero) for one with none.
- Confirm a country with zero regiments (or zero ships) does not appear
  in the respective table (spec FR-012).

## 5. Confirm accessibility/clarity (Constitution Principle VI)

Manually verify: Military Doctrine's dot/axis coloring doesn't rely on
red/green alone (reuses `SocietalCompassChart`'s existing palette); both
stat tables are sortable/scannable without relying on color alone to
convey the partial-total marker (icon or text label, not color only).
