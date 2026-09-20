// The RGO layer's colors, sourced directly from the game's own files
// (constitution Principle IV: represent what's actually there, not a
// generated approximation) rather than a computed palette.
//
// EU5 assigns every raw good a named color reference (e.g. `clay = {
// category = raw_material color = goods_clay }` in
// `game/in_game/common/goods/{00_raw_materials,01_plantation_goods,
// 02_produced_goods,03_food,04_special}.txt`), and each of those named
// colors resolves to an actual RGB (or HSV / HSV360) value in
// `game/main_menu/common/named_colors/02_map.txt`. This table is that
// two-step lookup pre-resolved into plain RGB, computed once against a
// real local install and confirmed to cover every one of the 52 distinct
// `raw_material` values a real save (`Russia (Melted).eu5`, 642MB)
// actually produces (specs/005-map-visualization research.md).
//
// `goods_gold` (not `gold`) is not a typo — that is genuinely the raw
// material's own internal name in the game's files, kept verbatim here
// so `dataset` rows (whose `rawMaterial` field comes straight from the
// save) match this table's keys exactly.
//
// This table is static game-reference data, not something derivable from
// a save at runtime (the browser has no access to a user's local game
// install) — regenerate it the same way if a future game version adds,
// renames, or recolors a raw good: re-run the same two-file lookup
// against an updated install and replace this table's contents.
export const RGO_GAME_COLORS: Record<string, [number, number, number]> = {
  alum: [123, 50, 45],
  amber: [255, 191, 0],
  beeswax: [204, 140, 37],
  chili: [191, 53, 25],
  clay: [190, 70, 70],
  cloves: [53, 191, 25],
  coal: [31, 31, 31],
  cocoa: [115, 54, 23],
  coffee: [56, 38, 23],
  copper: [217, 130, 87],
  cotton: [133, 173, 153],
  dyes: [161, 43, 128],
  elephants: [210, 106, 47],
  fiber_crops: [15, 76, 32],
  fish: [49, 120, 116],
  fruit: [242, 63, 63],
  fur: [138, 102, 79],
  gems: [0, 186, 118],
  goods_gold: [255, 214, 48],
  horses: [159, 129, 112],
  incense: [227, 201, 120],
  iron: [51, 51, 51],
  ivory: [191, 178, 161],
  lead: [50, 46, 230],
  legumes: [45, 150, 125],
  livestock: [96, 148, 10],
  lumber: [115, 120, 23],
  maize: [204, 143, 20],
  marble: [247, 230, 247],
  medicaments: [255, 127, 127],
  mercury: [224, 59, 80],
  millet: [60, 102, 41],
  olives: [72, 102, 0],
  pearls: [234, 224, 200],
  pepper: [173, 192, 192],
  potato: [255, 174, 106],
  rice: [100, 128, 78],
  saffron: [191, 87, 27],
  salt: [255, 255, 255],
  saltpeter: [150, 75, 0],
  sand: [242, 242, 111],
  silk: [184, 26, 26],
  silver: [192, 192, 192],
  stone: [61, 67, 76],
  sugar: [189, 242, 173],
  tea: [18, 84, 23],
  tin: [76, 76, 76],
  tobacco: [84, 143, 97],
  wheat: [212, 204, 19],
  wild_game: [222, 209, 93],
  wine: [92, 33, 71],
  wool: [138, 153, 153],
};
