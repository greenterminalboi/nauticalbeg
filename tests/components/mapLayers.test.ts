import { describe, expect, it } from "vitest";
import { MAP_LAYERS, NEUTRAL_COLOR, ZERO_COLOR } from "../../src/components/Overview/mapLayers";
import type { MapLocationDataset, MapLocationRow } from "../../src/components/Overview/mapLocationData";

let nextIdx = 1;

function makeRow(overrides: Partial<MapLocationRow> = {}): MapLocationRow {
  const idx = nextIdx++;
  return {
    idx,
    name: `location-${idx}`,
    ownerIdx: 2025,
    ownerColor: [183, 136, 27],
    ownerName: "RUS",
    controllerIdx: 2025,
    controllerColor: [183, 136, 27],
    controllerName: "RUS",
    control: 1,
    rawMaterial: "clay",
    totalPopulation: 5,
    development: 20,
    rank: "city",
    marketIdx: 1,
    marketName: "Stockholm",
    possibleTax: 10,
    soldiers: 5,
    cultureName: "swedish",
    cultureColor: [0, 104, 165],
    religionName: "lutheran",
    religionColor: [0, 0, 178],
    ...overrides,
  };
}

function datasetOf(rows: MapLocationRow[]): MapLocationDataset {
  return new Map(rows.map((row) => [row.name, row]));
}

function requireLayer(id: string) {
  const layer = MAP_LAYERS.find((l) => l.id === id);
  if (!layer) throw new Error(`layer "${id}" is not registered in MAP_LAYERS`);
  return layer;
}

describe("mapLayers political layer (specs/005-map-visualization US1)", () => {
  it("fills an owned location with its owner's real in-game color", () => {
    const layer = requireLayer("political");
    expect(layer.getFill(makeRow(), new Map())).toEqual([183, 136, 27]);
  });

  it("falls back to the shared neutral color for a location with no owner or no owner color, never a fabricated color", () => {
    const layer = requireLayer("political");
    expect(layer.getFill(makeRow({ ownerColor: null }), new Map())).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(makeRow({ ownerIdx: null, ownerColor: null }), new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and owner", () => {
    const layer = requireLayer("political");
    expect(layer.getTooltipFields(makeRow({ name: "Test Location" }))).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Owner", value: "RUS" },
    ]);
  });
});

describe("mapLayers population layer (specs/005-map-visualization US3)", () => {
  it("stays outlier-resistant: small locations remain distinguishable from each other next to one huge outlier", () => {
    const layer = requireLayer("population");
    const small1 = makeRow({ totalPopulation: 1 });
    const small2 = makeRow({ totalPopulation: 2 });
    const small3 = makeRow({ totalPopulation: 3 });
    const outlier = makeRow({ totalPopulation: 5000 });
    const dataset = datasetOf([small1, small2, small3, outlier]);

    const fill1 = layer.getFill(small1, dataset);
    const fill2 = layer.getFill(small2, dataset);
    const fill3 = layer.getFill(small3, dataset);

    // A naive linear min-max scale against a 5000-strong outlier would
    // collapse 1/2/3 to visually-identical near-zero shades; an
    // outlier-resistant (e.g. log-normalized) scale keeps them apart.
    expect(fill1).not.toEqual(fill2);
    expect(fill2).not.toEqual(fill3);
    expect(fill1).not.toEqual(fill3);
  });

  it("shades a location with no confirmed data (development null) distinctly from a confirmed zero or a populated one", () => {
    const layer = requireLayer("population");
    // Population piggybacks on `development`'s own null-ness (user
    // request 2026-09-22: mapLayers.ts's populationLayer doc comment) —
    // `totalPopulation` alone can never be null (the query's own
    // COALESCE), so "no data" only shows through when development is
    // null too.
    const noData = makeRow({ development: null, totalPopulation: 0 });
    const zero = makeRow({ development: 20, totalPopulation: 0 });
    const populated = makeRow({ development: 20, totalPopulation: 10 });
    const dataset = datasetOf([noData, zero, populated]);
    expect(layer.getFill(noData, dataset)).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(zero, dataset)).toEqual(ZERO_COLOR);
    expect(layer.getFill(populated, dataset)).not.toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(populated, dataset)).not.toEqual(ZERO_COLOR);
  });

  it("tooltip surfaces the location's name and population figure", () => {
    const layer = requireLayer("population");
    const row = makeRow({ name: "Test Location", totalPopulation: 42 });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Population", value: expect.stringContaining("42") },
    ]);
  });
});

describe("mapLayers RGO layer (specs/005-map-visualization US4)", () => {
  it("assigns each distinct raw good a distinct color, deterministically for the same dataset", () => {
    const layer = requireLayer("rgo");
    const clay = makeRow({ rawMaterial: "clay" });
    const wool = makeRow({ rawMaterial: "wool" });
    const iron = makeRow({ rawMaterial: "iron" });
    const dataset = datasetOf([clay, wool, iron]);

    const clayColor1 = layer.getFill(clay, dataset);
    const woolColor1 = layer.getFill(wool, dataset);
    const ironColor1 = layer.getFill(iron, dataset);

    expect(clayColor1).not.toEqual(woolColor1);
    expect(clayColor1).not.toEqual(ironColor1);
    expect(woolColor1).not.toEqual(ironColor1);
    expect(clayColor1).not.toEqual(NEUTRAL_COLOR);

    // Same dataset reference, same inputs, called again — must be stable.
    expect(layer.getFill(clay, dataset)).toEqual(clayColor1);
    expect(layer.getFill(wool, dataset)).toEqual(woolColor1);
  });

  it("falls back to the neutral color for a location with no raw good, never assigning it a real good's color", () => {
    const layer = requireLayer("rgo");
    const clay = makeRow({ rawMaterial: "clay" });
    const none = makeRow({ rawMaterial: null });
    const dataset = datasetOf([clay, none]);
    expect(layer.getFill(none, dataset)).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and raw good", () => {
    const layer = requireLayer("rgo");
    const row = makeRow({ name: "Test Location", rawMaterial: "clay" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Raw Good", value: "clay" },
    ]);
  });

  it("legend lists every distinct raw good present in the dataset with its assigned color", () => {
    const layer = requireLayer("rgo");
    const clay = makeRow({ rawMaterial: "clay" });
    const wool = makeRow({ rawMaterial: "wool" });
    const dataset = datasetOf([clay, wool]);
    const legend = layer.getLegend(dataset);
    expect(legend.map((e) => e.label).sort()).toEqual(["clay", "wool"]);
  });

  it("uses the game's own RGO color for a known raw good, not a generated one", () => {
    const layer = requireLayer("rgo");
    const clay = makeRow({ rawMaterial: "clay" });
    const dataset = datasetOf([clay]);
    // RGO_GAME_COLORS["clay"], resolved from the real game's
    // common/goods/*.txt + common/named_colors/02_map.txt files
    // (rgoGameColors.ts's doc comment) — not a golden-angle hue.
    expect(layer.getFill(clay, dataset)).toEqual([190, 70, 70]);
  });

  it("still assigns a stable, distinct color to a raw good not in the game color table (fallback path)", () => {
    const layer = requireLayer("rgo");
    const mystery = makeRow({ rawMaterial: "totally_unknown_future_good" });
    const dataset = datasetOf([mystery]);
    const color = layer.getFill(mystery, dataset);
    expect(color).not.toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(mystery, dataset)).toEqual(color);
  });
});

describe("mapLayers control layer (specs/005-map-visualization US5)", () => {
  it("renders full control at the controller's full-strength color", () => {
    const layer = requireLayer("control");
    const row = makeRow({ controllerColor: [183, 136, 27], control: 1 });
    expect(layer.getFill(row, new Map())).toEqual([183, 136, 27]);
  });

  it("visibly fades a low-control location toward the neutral style, distinct from both full control and the neutral color itself", () => {
    const layer = requireLayer("control");
    const full = makeRow({ controllerColor: [183, 136, 27], control: 1 });
    const low = makeRow({ controllerColor: [183, 136, 27], control: 0.1 });
    const fullFill = layer.getFill(full, new Map());
    const lowFill = layer.getFill(low, new Map());
    expect(lowFill).not.toEqual(fullFill);
    expect(lowFill).not.toEqual(NEUTRAL_COLOR);
  });

  it("renders the neutral style outright for a location with no controller", () => {
    const layer = requireLayer("control");
    const row = makeRow({ controllerIdx: null, controllerColor: null, control: null });
    expect(layer.getFill(row, new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name, controller, and control level", () => {
    const layer = requireLayer("control");
    const row = makeRow({ name: "Test Location", controllerName: "RUS", control: 0.75 });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Controller", value: "RUS" },
      { label: "Control", value: expect.stringContaining("75") },
    ]);
  });
});

describe("mapLayers terrain layer (specs/011-atlas-map-modes US2)", () => {
  it("colors a location by its real terrain category, sourced from the generated location_templates.txt lookup", () => {
    const layer = requireLayer("terrain");
    // stockholm's real topography is "flatland" (locationTerrain.ts,
    // generated from the real local install — research.md §5).
    const row = makeRow({ name: "stockholm" });
    expect(layer.getFill(row, new Map())).not.toEqual(NEUTRAL_COLOR);
    // Same category always resolves to the same color.
    expect(layer.getFill(row, new Map())).toEqual(layer.getFill(makeRow({ name: "stockholm" }), new Map()));
  });

  it("falls back to the neutral color for a location name absent from the terrain lookup", () => {
    const layer = requireLayer("terrain");
    const row = makeRow({ name: "definitely-not-a-real-location-xyz" });
    expect(layer.getFill(row, new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and terrain category", () => {
    const layer = requireLayer("terrain");
    const row = makeRow({ name: "stockholm" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "stockholm" },
      { label: "Terrain", value: "flatland" },
    ]);
  });
});

describe("mapLayers rank layer (specs/011-atlas-map-modes US3)", () => {
  it("assigns each of the 4 confirmed rank values a distinct color", () => {
    const layer = requireLayer("rank");
    const rural = layer.getFill(makeRow({ rank: "rural_settlement" }), new Map());
    const town = layer.getFill(makeRow({ rank: "town" }), new Map());
    const city = layer.getFill(makeRow({ rank: "city" }), new Map());
    const mega = layer.getFill(makeRow({ rank: "megalopolis" }), new Map());
    const colors = [rural, town, city, mega];
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(colors[i]).not.toEqual(colors[j]);
      }
    }
  });

  it("falls back to the neutral color for a location with no rank", () => {
    const layer = requireLayer("rank");
    expect(layer.getFill(makeRow({ rank: null }), new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and rank", () => {
    const layer = requireLayer("rank");
    const row = makeRow({ name: "Test Location", rank: "city" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Rank", value: "city" },
    ]);
  });
});

describe("mapLayers primary culture layer (specs/011-atlas-map-modes US4)", () => {
  it("fills a location with its culture's real in-game color, sourced from the save", () => {
    const layer = requireLayer("primaryCulture");
    const row = makeRow({ cultureColor: [0, 104, 165] });
    expect(layer.getFill(row, new Map())).toEqual([0, 104, 165]);
  });

  it("falls back to the neutral color for a location with no culture, or whose culture id doesn't resolve", () => {
    const layer = requireLayer("primaryCulture");
    expect(layer.getFill(makeRow({ cultureColor: null }), new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and culture name", () => {
    const layer = requireLayer("primaryCulture");
    const row = makeRow({ name: "Test Location", cultureName: "swedish" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Culture", value: "swedish" },
    ]);
  });

  it("legend lists every distinct culture present in the dataset, sorted", () => {
    const layer = requireLayer("primaryCulture");
    const swedish = makeRow({ cultureName: "swedish", cultureColor: [0, 104, 165] });
    const polesian = makeRow({ cultureName: "polesian_culture", cultureColor: [166, 133, 133] });
    const dataset = datasetOf([swedish, polesian]);
    expect(layer.getLegend(dataset)).toEqual([
      { color: [166, 133, 133], label: "polesian_culture" },
      { color: [0, 104, 165], label: "swedish" },
    ]);
  });
});

describe("mapLayers primary religion layer (specs/011-atlas-map-modes US5)", () => {
  it("fills a location with its religion's real in-game color, sourced from the save", () => {
    const layer = requireLayer("primaryReligion");
    const row = makeRow({ religionColor: [0, 0, 178] });
    expect(layer.getFill(row, new Map())).toEqual([0, 0, 178]);
  });

  it("falls back to the neutral color for a location with no religion, or whose religion id doesn't resolve", () => {
    const layer = requireLayer("primaryReligion");
    expect(layer.getFill(makeRow({ religionColor: null }), new Map())).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and religion name", () => {
    const layer = requireLayer("primaryReligion");
    const row = makeRow({ name: "Test Location", religionName: "lutheran" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Religion", value: "lutheran" },
    ]);
  });
});

describe("mapLayers market layer (specs/011-atlas-map-modes US6)", () => {
  it("assigns two different markets visibly distinct colors, deterministically for the same dataset", () => {
    const layer = requireLayer("market");
    const market1 = makeRow({ marketIdx: 1, marketName: "Stockholm" });
    const market2 = makeRow({ marketIdx: 2, marketName: "Mazyr" });
    const dataset = datasetOf([market1, market2]);
    const fill1 = layer.getFill(market1, dataset);
    const fill2 = layer.getFill(market2, dataset);
    expect(fill1).not.toEqual(fill2);
    expect(layer.getFill(market1, dataset)).toEqual(fill1);
  });

  it("falls back to the neutral color for a location with no market", () => {
    const layer = requireLayer("market");
    const row = makeRow({ marketIdx: null, marketName: null });
    expect(layer.getFill(row, datasetOf([row]))).toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and its market's real center-location name, not a bare index", () => {
    const layer = requireLayer("market");
    const row = makeRow({ name: "Test Location", marketIdx: 7, marketName: "Novgorod" });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Market", value: "Novgorod" },
    ]);
  });

  it("excludes a water/sea location from the market fill and legend, even when it carries a market id", () => {
    const layer = requireLayer("market");
    // central_atlantic is real generated terrain data: "ocean_wasteland"
    // (locationTerrain.ts) — a market's raw membership can include water
    // tiles, but this layer must not color them (post-ship correction).
    const sea = makeRow({ name: "central_atlantic", marketIdx: 1, marketName: "Stockholm" });
    const land = makeRow({ marketIdx: 1, marketName: "Stockholm" });
    const dataset = datasetOf([sea, land]);
    expect(layer.getFill(sea, dataset)).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(land, dataset)).not.toEqual(NEUTRAL_COLOR);
    expect(layer.getTooltipFields(sea)).toEqual([
      { label: "Location", value: "central_atlantic" },
      { label: "Market", value: "No data" },
    ]);
  });

  it("legend labels each market by its real name, not a bare index", () => {
    const layer = requireLayer("market");
    const row = makeRow({ marketIdx: 3, marketName: "Novgorod" });
    const dataset = datasetOf([row]);
    expect(layer.getLegend(dataset)).toEqual([
      { color: layer.getFill(row, dataset), label: "Novgorod" },
    ]);
  });
});

describe("mapLayers tax base layer (specs/011-atlas-map-modes US7)", () => {
  it("shades a location with no confirmed tax base distinctly from a confirmed zero or a taxed one", () => {
    const layer = requireLayer("taxBase");
    const noData = makeRow({ possibleTax: null });
    const zero = makeRow({ possibleTax: 0 });
    const taxed = makeRow({ possibleTax: 40 });
    const dataset = datasetOf([noData, zero, taxed]);
    expect(layer.getFill(noData, dataset)).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(zero, dataset)).toEqual(ZERO_COLOR);
    expect(layer.getFill(taxed, dataset)).not.toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(taxed, dataset)).not.toEqual(ZERO_COLOR);
  });

  it("tooltip surfaces the location's name and tax base value", () => {
    const layer = requireLayer("taxBase");
    const row = makeRow({ name: "Test Location", possibleTax: 31.69176 });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Tax Base", value: expect.stringContaining("31.7") },
    ]);
  });
});

describe("mapLayers soldiers layer (specs/011-atlas-map-modes US8)", () => {
  it("shades a location with no soldiers value distinctly from one with soldiers", () => {
    const layer = requireLayer("soldiers");
    const empty = makeRow({ soldiers: 0 });
    const garrisoned = makeRow({ soldiers: 9.5 });
    const dataset = datasetOf([empty, garrisoned]);
    expect(layer.getFill(empty, dataset)).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(garrisoned, dataset)).not.toEqual(NEUTRAL_COLOR);
  });

  it("tooltip surfaces the location's name and soldier population", () => {
    const layer = requireLayer("soldiers");
    const row = makeRow({ name: "Test Location", soldiers: 9.5 });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Soldiers", value: expect.stringContaining("9.5") },
    ]);
  });
});

describe("mapLayers development layer (specs/011-atlas-map-modes US1)", () => {
  it("shades a location with no confirmed development distinctly from a confirmed zero or a developed one", () => {
    const layer = requireLayer("development");
    const noData = makeRow({ development: null });
    const zero = makeRow({ development: 0 });
    const developed = makeRow({ development: 40 });
    const dataset = datasetOf([noData, zero, developed]);
    expect(layer.getFill(noData, dataset)).toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(zero, dataset)).toEqual(ZERO_COLOR);
    expect(layer.getFill(developed, dataset)).not.toEqual(NEUTRAL_COLOR);
    expect(layer.getFill(developed, dataset)).not.toEqual(ZERO_COLOR);
  });

  it("colors low-to-high development purple-to-red on the spectral gradient, spread evenly by rank regardless of how skewed the raw values are", () => {
    const layer = requireLayer("development");
    // A deliberately skewed distribution (one huge outlier) — a
    // value-based scale would bunch small1/small2 into near-identical
    // shades; rank-based spreads them evenly no matter the skew.
    const small1 = makeRow({ development: 1 });
    const small2 = makeRow({ development: 2 });
    const mid = makeRow({ development: 3 });
    const outlier = makeRow({ development: 5000 });
    const dataset = datasetOf([small1, small2, mid, outlier]);

    const fill1 = layer.getFill(small1, dataset);
    const fill2 = layer.getFill(small2, dataset);
    const fillMid = layer.getFill(mid, dataset);
    const fillOutlier = layer.getFill(outlier, dataset);

    // Every rank gets a visibly distinct color, not just the extremes.
    expect(fill1).not.toEqual(fill2);
    expect(fill2).not.toEqual(fillMid);
    expect(fillMid).not.toEqual(fillOutlier);

    // Lowest rank is the spectral gradient's first (purple) stop,
    // highest rank is its last (red) stop.
    expect(fill1).toEqual([126, 47, 142]);
    expect(fillOutlier).toEqual([215, 48, 39]);
  });

  it("tooltip surfaces the location's name and raw development value", () => {
    const layer = requireLayer("development");
    const row = makeRow({ name: "Test Location", development: 42 });
    expect(layer.getTooltipFields(row)).toEqual([
      { label: "Location", value: "Test Location" },
      { label: "Development", value: expect.stringContaining("42") },
    ]);
  });
});
