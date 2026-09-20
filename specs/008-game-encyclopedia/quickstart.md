# Quickstart: Validating Game Encyclopedia

Prerequisites: this repo's dependencies installed (`npm install` — no
new runtime dependency this feature adds, per research.md §1: reuses
the existing `jomini` package), and a local EU5 install (path per the
`EU5 save format gotchas` memory / research.md §6) to run generation
against at least once.

## 1. Generate the Encyclopedia data (spec FR-002, FR-010, FR-012)

```bash
npx tsx tools/encyclopedia-scraping/generate.ts --install "/Users/halda/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Europa Universalis V/game"
```

Expected: `public/encyclopedia/manifest.json`, `search-index.json`, and
one `<category>.json` per included category are written. `manifest.json`
lists every one of the ~124 source categories in either `domainGroups`
or `excludedCategories` — confirm none are missing from both:

```bash
node -e '
  const m = require("./public/encyclopedia/manifest.json");
  const included = m.domainGroups.flatMap(g => g.categories.map(c => c.id));
  const excluded = m.excludedCategories.map(c => c.id);
  console.log("included:", included.length, "excluded:", excluded.length);
'
```

Re-run the same command a second time and diff the output directory —
it should be byte-identical (spec SC-004, determinism).

## 2. Confirm a failed install path fails loudly (spec FR-012)

```bash
npx tsx tools/encyclopedia-scraping/generate.ts --install /tmp/not-a-game-install
```

Expected: non-zero exit code, a clear stderr message — never a silent
empty `public/encyclopedia/` write.

## 3. Confirm the generation-tool unit tests pass (spec FR-004, FR-013, FR-014)

```bash
npm test -- tests/encyclopedia-scraping
```

Expected: localization fallback-to-raw-key behavior, a malformed
definition file being skipped-and-recorded rather than aborting the run,
and category+key uniqueness are all covered against small committed
fixtures (not the real game install — CI has none).

## 4. Confirm the Encyclopedia UI (spec User Stories 1–3)

```bash
npm run dev
```

- Open the app, select the **Encyclopedia** top-level section (no save
  needs to be loaded — this section is save-independent).
- Confirm **Economy & Production** shows real entries for goods,
  building categories, building types, production methods, prices, and
  pop types (User Story 1) — open the good "Horses" and confirm its real
  name/description/fields render, not the raw key `horses`.
- Confirm the other four domain groups (Government & Society,
  Culture/Religion/Characters, Military & Diplomacy, World & Events)
  list real entries too (User Story 2), and that a DLC-sourced entry
  (if the local install has any DLC installed) is visibly labeled as
  such.
- Open an entry with a known cross-reference (e.g. a building whose
  `category` field points at a Building Category entry) and confirm it
  renders as a working link (User Story 3).
- Use the global search box to find an entry by name or key from a
  domain group other than the one currently open (User Story 3).

## 5. Confirm no game art ships (spec FR-011, SC-003)

```bash
git ls-files | grep -iE '\.(dds|png|jpg|jpeg|tga)$' | grep -i encyclopedia
```

Expected: no output. This feature must never introduce a committed
image file sourced from the game install.
