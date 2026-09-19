# Quickstart: Validating Province Map Generation

Prerequisites: a local EU5 installation (this plan was researched against
one found at `.../Steam/steamapps/common/Europa Universalis V` on this
machine, under `game/in_game/map_data/` — see `research.md` §1), Node.js,
and this repo's dependencies installed (`npm install`, which will pull in
the new `tsx`/`pngjs`/`topojson-server`/`topojson-simplify`/`topojson-client`
devDependencies this feature adds).

## 1. Run the generator

```bash
npm run generate:map -- --install "/path/to/Europa Universalis V"
```

Expected: exits `0`, prints a summary (province and location counts
written, any skipped-location count per research.md §6), and writes both
`public/map/provinces.topojson` (both layers) and
`public/map/locations.topojson` (locations only). Confirmed against the
reference install: 4,309 provinces, 28,573 locations, 0 skipped.

## 2. Validate coverage (spec SC-001, SC-002)

```bash
node -e '
  const { feature } = require("topojson-client");
  const topology = require("./public/map/provinces.topojson");
  const provinces = feature(topology, topology.objects.provinces);
  const locations = feature(topology, topology.objects.locations);
  console.log("provinces:", provinces.features.length);
  console.log("locations:", locations.features.length);
  console.log("sample province name:", provinces.features[0].properties.name);
'
```

- `provinces.features.length` should be in the low thousands (4,309
  against the reference install; the exact count depends on the
  installation's own map data, not fixed here — see contract's
  "explicitly not guaranteed" section) and `locations.features.length` in
  the high tens of thousands.
- Pick a known province name from `definitions.txt` (e.g.
  `uppland_province`) and confirm a feature with that exact `name` exists
  in the decoded output.
- `public/map/locations.topojson` should decode independently (load that
  file instead, then `feature(thatTopology, thatTopology.objects.locations)`)
  to the exact same `locations.features.length` and name set.

## 3. Validate join-ability against a real parsed save (spec SC-002)

Load any real save through the existing app (or existing test fixture,
`tests/fixtures/rus-1628-minimal.eu5`) and query `provinces.name`; confirm
every non-null name returned is either present in the decoded
`provinces.topojson`'s `features[].properties.name` set (per step 2), or
explicitly accounted for as an expected miss (different game version). No
manual remapping table should be needed to make the match.

## 4. Validate shape accuracy (spec SC-003, SC-006)

Preferred: run `npm run dev` and open the demo page (User Story 2) at
`http://localhost:5173/tools/map-generation/demo/index.html` (port may
differ — check the dev server's own printed URL). It renders both
layers — location borders (thin, light) beneath province borders (bolder,
dark). Pan and zoom around the whole map, confirming borders render
everywhere and stay visually correct at every zoom level, and that
zooming into any region reveals the finer location subdivisions inside
each province (validates SC-006, and Acceptance Scenarios 1-4 of User
Story 2).

Fallback (if the demo page isn't built yet): decode
`public/map/provinces.topojson` (per step 2's snippet — most GeoJSON-aware
viewers don't read raw TopoJSON directly) and open the resulting GeoJSON
in any GeoJSON-aware viewer (e.g. a local GIS tool, or a code editor's
GeoJSON preview extension); visually compare a handful of provinces'
shapes and positions against the same provinces on EU5's own in-game map.

Either way: do not upload the rendered output to a public/third-party web
tool — per this feature's constitution exception (research.md §8), this
asset is intentionally committed to the repo, but validating it should
still stay local tooling (the dev-only demo page included), not a public
share, to avoid any ambiguity about redistributing Paradox-derived
geometry beyond the app itself.

## 5. Validate idempotency (spec SC-005)

```bash
npm run generate:map -- --install "/path/to/Europa Universalis V" \
  --out /tmp/rerun.topojson --out-locations /tmp/rerun-locations.topojson
node -e '
  const { feature } = require("topojson-client");
  const countFeatures = (path, objectKey) => {
    const topology = require(path);
    return feature(topology, topology.objects[objectKey]).features.length;
  };
  console.log("provinces:", countFeatures("./public/map/provinces.topojson", "provinces"), countFeatures("/tmp/rerun.topojson", "provinces"));
  console.log("locations (combined file):", countFeatures("./public/map/provinces.topojson", "locations"), countFeatures("/tmp/rerun.topojson", "locations"));
  console.log("locations (locations-only file):", countFeatures("./public/map/locations.topojson", "locations"), countFeatures("/tmp/rerun-locations.topojson", "locations"));
'
```

Expect no diff in any of the three counts (and, ideally, identical `name` sets).

## 6. Validate error handling (spec FR-007, edge cases)

```bash
npm run generate:map -- --install /nonexistent/path
```

Expect a non-zero exit and a clear error naming the missing path — not a
stack trace dump, not a silently-empty output file.
