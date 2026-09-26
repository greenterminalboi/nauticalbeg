// specs/018: the game's estate and pop-type colors, shared by the
// Overview pies and the Estates tab.
export type Rgb = [number, number, number];

// The game's own colors (main_menu/common/named_colors/02_map.txt, the
// pop_* and estate_* entries, converted from hsv360/hsv to RGB), so the
// pies read like the in-game estate and population screens. A color
// belongs to the group, never to its rank (owner decision 2026-09-26:
// use the game-file colors throughout).
export const POP_TYPE_COLORS: Record<string, Rgb> = {
  nobles: [84, 116, 204], // pop_nobles: blue
  clergy: [200, 211, 230], // pop_clergy: white
  burghers: [201, 143, 26], // pop_burghers: yellow
  laborers: [36, 42, 51], // pop_laborers: near-black
  peasants: [104, 120, 67], // pop_peasants: green
  soldiers: [224, 58, 58], // pop_soldiers: red
  slaves: [92, 92, 92], // pop_slaves: grey
  tribesmen: [120, 85, 67], // pop_tribes: dark brown
};

export const ESTATE_COLORS: Record<string, Rgb> = {
  crown_estate: [157, 92, 204], // estate_crown
  nobles_estate: POP_TYPE_COLORS.nobles,
  // estates.json maps clergy_estate to pop_clergy (the in-game estate
  // icon art reads peachier, but the owner chose the game-file color).
  clergy_estate: POP_TYPE_COLORS.clergy,
  burghers_estate: POP_TYPE_COLORS.burghers,
  peasants_estate: POP_TYPE_COLORS.peasants,
  dhimmi_estate: [217, 13, 90], // estate_dhimmi
  tribes_estate: POP_TYPE_COLORS.tribesmen,
  cossacks_estate: [195, 200, 60], // map_cossack
};
