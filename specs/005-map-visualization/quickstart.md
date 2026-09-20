# Quickstart: Validating Map Visualization

Prerequisites: this repo's dependencies installed (`npm install` — no
new dependencies this feature adds, per research.md §8: no new rendering
library), the real trimmed fixture at `tests/fixtures/rus-1628-minimal.eu5`
(already committed), and `public/map/provinces.topojson`/
`locations.topojson` already generated (feature 003 — regenerate with
`npm run generate:map -- --install "..."` only if missing/stale).

## 1. Confirm the schema/parser additions land (spec FR-008, FR-017)

```bash
npm test -- tests/parser/adapter.test.ts
```

Expected: existing adapter tests still pass, plus new assertions (added
by this feature's tasks) that a real location row now has non-null
`name`/`raw_material`/`controller_idx`/`control` and a real nation row
has non-null `color_r`/`color_g`/`color_b`, for entries the fixture
actually carries this data for (research.md §11 — verify the fixture
covers these fields before trusting this step; extend the fixture first
if not).

## 2. Confirm kept-save compatibility (research.md §6)

```bash
npm test -- tests/storage
```

Expected: a test opening a database created before this feature's
`ALTER TABLE` additions (or a freshly-created one with the columns
already stripped) still opens successfully after the additive schema
step runs, with the new columns present and `NULL` rather than a SQL
error.

## 3. Confirm the location join actually resolves (spec SC-003, SC-007, SC-008)

```bash
node -e '
  const { feature } = require("topojson-client");
  const topology = require("./public/map/locations.topojson");
  const locations = feature(topology, topology.objects.locations);
  console.log("geometry location count:", locations.features.length);
  console.log("sample geometry name:", locations.features[0].properties.name);
'
```

Then, against a real loaded save (the app, or the test fixture via
`listMapLocationsArrow`), confirm every non-null `locations.name` value
from the database matches a `properties.name` in the decoded geometry
above — this is the real join key (research.md §1, sourced from the
save's own `metadata.compatibility.locations` array), the same
convention the province-name join already uses. Expect near-100%
coverage (confirmed against a real save: 100% end-to-end); a material
drop from that would mean something regressed.

## 4. Manual verification in the running app (spec User Stories 1-5)

```bash
npm run dev
```

1. Load a save (the real fixture, or a full real save file).
2. Open the **Map** tab — confirm it's no longer the "coming soon"
   placeholder and the map renders within a few seconds (spec SC-001).
3. Expand the sidebar — confirm all four layers are listed (Political,
   Location Population, RGO, Control) with Political active by default.
4. **Political**: confirm owned locations show their country's real
   in-game color (spot-check 2-3 well-known countries' colors against
   the raw save/known EU5 palette); unowned/no-data locations look
   visibly neutral, not blank.
5. Switch to **Location Population**: confirm shading varies sensibly
   (a populous capital region visually denser than a rural fringe);
   hover a location and confirm its population value shows.
6. Switch to **RGO**: confirm distinct raw goods get distinct colors and
   the legend lists them; hover a location and confirm its raw good
   name shows.
7. Switch to **Control**: confirm a location under full control renders
   solidly, and (if the loaded save has an active war/occupation) an
   occupied location's controller differs visibly from its Political-
   layer owner; hover a location and confirm both controller and control
   level show.
8. Confirm each switch in steps 4-7 happens in well under a second with
   no visible reload/flash, and pan/zoom position is preserved across
   switches (spec SC-002) — open the browser's network panel and confirm
   no new query fires on a layer switch (research.md §7).
9. Collapse and re-expand the sidebar a few times — confirm the map
   view/position is unaffected (spec SC-005).
10. Pan and zoom across the full map — confirm it stays responsive with
    the complete location set loaded (spec SC-006).
11. With no save loaded, open the Map tab — confirm it shows the same
    "load a save first" empty state as other data-driven sections, not a
    broken/blank map.

## 5. Accessibility spot-check (constitution Principle VI)

For each layer, confirm color is never the *only* way to distinguish two
locations — hovering/selecting must always surface a text label (owner
name, population figure, raw good name, or controller + control level)
independent of being able to see the color.
