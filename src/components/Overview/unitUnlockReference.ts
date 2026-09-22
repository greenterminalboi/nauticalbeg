// The advance -> unlocked-unit-type lookup, sourced directly from the
// game's own advance definition files (constitution Principle IV / the
// Encyclopedia-data exception): every advance in
// `game/in_game/common/advances/*.txt` that carries an `unlock_unit`
// field, confirmed against a real local install and cross-checked
// against a real save's `researched_advances` flags (specs/012-firepower-tab
// research.md §4, §6) — the flat `<advance>=yes` boolean list on a
// country's save record is confirmed to be the real, only gate; this
// table is what turns that boolean list into a recruitable unit roster.
//
// `potential` captures the small subset of unlock-gating triggers this
// feature actually interprets (a culture-group check, a region check, or
// a tag check per data-model.md's "known accepted simplification") —
// anything more complex is kept as `raw` (the full parsed trigger,
// JSON-stringified) rather than guessed at or silently dropped. Most
// entries have no `potential` at all: a country-specific advance file
// (e.g. `country_chi.txt`) is already correctly scoped by the advance's
// own research-availability gate, so the flag alone is authoritative for
// those (research.md §4's note) — `potential` here only matters for
// the minority of *culture-group*- or *region*-gated unique unlocks.
//
// Static game-reference data, not derivable from a save at runtime.
// Regenerate with: npx tsx tools/firepower-reference/generate-unit-unlocks.ts --install "<path to game/ dir>"
export interface UnitUnlockReferenceEntry {
  advance: string;
  unlockedUnitTypes: string[];
  potential?: { cultureGroup?: string; region?: string[]; tag?: string; raw?: string };
}

export const UNIT_UNLOCK_REFERENCE: UnitUnlockReferenceEntry[] = [
  {
    "advance": "unlock_handgonners_advance",
    "unlockedUnitTypes": [
      "a_handgonners"
    ]
  },
  {
    "advance": "unlock_footmen_advance",
    "unlockedUnitTypes": [
      "a_footmen"
    ]
  },
  {
    "advance": "unlock_archers_advance",
    "unlockedUnitTypes": [
      "a_archers"
    ]
  },
  {
    "advance": "unlock_men_at_arms_advance",
    "unlockedUnitTypes": [
      "a_men_at_arms"
    ]
  },
  {
    "advance": "unlock_crossbowmen_advance",
    "unlockedUnitTypes": [
      "a_crossbowmen"
    ]
  },
  {
    "advance": "unlock_reformed_crusader_knights_advance",
    "unlockedUnitTypes": [
      "a_late_crusader_knights",
      "a_order_knights",
      "a_order_knights_2"
    ],
    "potential": {
      "raw": "{\"modifier:allow_military_order_units\":true}"
    }
  },
  {
    "advance": "unlock_halberdiers_advance",
    "unlockedUnitTypes": [
      "a_halberdiers"
    ]
  },
  {
    "advance": "unlock_early_arquebusiers_advance",
    "unlockedUnitTypes": [
      "a_early_arquebusiers"
    ]
  },
  {
    "advance": "unlock_arquebusiers_advance",
    "unlockedUnitTypes": [
      "a_arquebusiers"
    ]
  },
  {
    "advance": "unlock_pikemen_advance",
    "unlockedUnitTypes": [
      "a_pikemen"
    ]
  },
  {
    "advance": "unlock_hunters_advance",
    "unlockedUnitTypes": [
      "a_hunters"
    ]
  },
  {
    "advance": "unlock_musketeers_advance",
    "unlockedUnitTypes": [
      "a_musketeers"
    ]
  },
  {
    "advance": "unlock_sharpshooters_advance",
    "unlockedUnitTypes": [
      "a_sharpshooters"
    ]
  },
  {
    "advance": "unlock_fusiliers_advance",
    "unlockedUnitTypes": [
      "a_fusiliers"
    ]
  },
  {
    "advance": "unlock_grenadiers_advance",
    "unlockedUnitTypes": [
      "a_grenadiers"
    ]
  },
  {
    "advance": "unlock_horsemen_advance",
    "unlockedUnitTypes": [
      "a_horsemen"
    ]
  },
  {
    "advance": "unlock_armored_horsemen_advance",
    "unlockedUnitTypes": [
      "a_armored_horsemen"
    ]
  },
  {
    "advance": "unlock_cavalry_advance",
    "unlockedUnitTypes": [
      "a_cavalrymen"
    ]
  },
  {
    "advance": "unlock_heavy_cavalry_advance",
    "unlockedUnitTypes": [
      "a_heavy_cavalrymen"
    ]
  },
  {
    "advance": "unlock_lancers_advance",
    "unlockedUnitTypes": [
      "a_lancers"
    ]
  },
  {
    "advance": "unlock_light_lancers_advance",
    "unlockedUnitTypes": [
      "a_light_lancers"
    ]
  },
  {
    "advance": "unlock_pistoleers_advance",
    "unlockedUnitTypes": [
      "a_pistoleers"
    ]
  },
  {
    "advance": "unlock_heavy_lancers_advance",
    "unlockedUnitTypes": [
      "a_heavy_lancers"
    ]
  },
  {
    "advance": "unlock_hussars_advance",
    "unlockedUnitTypes": [
      "a_hussars"
    ]
  },
  {
    "advance": "unlock_gallop_cavalry_advance",
    "unlockedUnitTypes": [
      "a_gallop_cavalry"
    ]
  },
  {
    "advance": "unlock_light_dragoons_advance",
    "unlockedUnitTypes": [
      "a_light_dragoons"
    ]
  },
  {
    "advance": "unlock_cuirassiers_advance",
    "unlockedUnitTypes": [
      "a_cuirassiers"
    ]
  },
  {
    "advance": "unlock_houfnice_advance",
    "unlockedUnitTypes": [
      "a_houfnice"
    ]
  },
  {
    "advance": "unlock_falconet_advance",
    "unlockedUnitTypes": [
      "a_falconet"
    ]
  },
  {
    "advance": "unlock_chambered_cannon_advance",
    "unlockedUnitTypes": [
      "a_chambered_cannon"
    ]
  },
  {
    "advance": "unlock_royal_mortar_advance",
    "unlockedUnitTypes": [
      "a_royal_mortar"
    ]
  },
  {
    "advance": "unlock_flying_battery_advance",
    "unlockedUnitTypes": [
      "a_flying_battery"
    ]
  },
  {
    "advance": "unlock_supply_carts",
    "unlockedUnitTypes": [
      "a_supply_carts"
    ]
  },
  {
    "advance": "unlock_supply_convoy",
    "unlockedUnitTypes": [
      "a_supply_convoy"
    ]
  },
  {
    "advance": "unlock_baggage_train",
    "unlockedUnitTypes": [
      "a_baggage_train"
    ]
  },
  {
    "advance": "unlock_wagon_train",
    "unlockedUnitTypes": [
      "a_wagon_train"
    ]
  },
  {
    "advance": "unlock_logistics_corps",
    "unlockedUnitTypes": [
      "a_logistics_corps"
    ]
  },
  {
    "advance": "unlock_early_carrack_advance",
    "unlockedUnitTypes": [
      "n_early_carrack"
    ]
  },
  {
    "advance": "unlock_carrack_advance",
    "unlockedUnitTypes": [
      "n_carrack"
    ]
  },
  {
    "advance": "unlock_galleon_advance",
    "unlockedUnitTypes": [
      "n_galleon"
    ]
  },
  {
    "advance": "unlock_twodecker_advance",
    "unlockedUnitTypes": [
      "n_twodecker"
    ]
  },
  {
    "advance": "unlock_threedecker_advance",
    "unlockedUnitTypes": [
      "n_threedecker"
    ]
  },
  {
    "advance": "unlock_ship_of_the_line_advance",
    "unlockedUnitTypes": [
      "n_ship_of_the_line"
    ]
  },
  {
    "advance": "unlock_war_galleon",
    "unlockedUnitTypes": [
      "n_war_galleon"
    ],
    "potential": {
      "raw": "{\"original_capital\":{\"EXISTS\":{\"continent\":\"continent:europe\"}}}"
    }
  },
  {
    "advance": "unlock_baochuan",
    "unlockedUnitTypes": [
      "n_baochuan"
    ],
    "potential": {
      "cultureGroup": "chinese_group"
    }
  },
  {
    "advance": "unlock_barque_advance",
    "unlockedUnitTypes": [
      "n_barque"
    ]
  },
  {
    "advance": "unlock_caravel_advance",
    "unlockedUnitTypes": [
      "n_caravel"
    ]
  },
  {
    "advance": "unlock_pinnace_advance",
    "unlockedUnitTypes": [
      "n_pinnace"
    ]
  },
  {
    "advance": "unlock_frigate_advance",
    "unlockedUnitTypes": [
      "n_frigate"
    ]
  },
  {
    "advance": "unlock_heavy_frigate_advance",
    "unlockedUnitTypes": [
      "n_heavy_frigate"
    ]
  },
  {
    "advance": "unlock_bomb_ketch",
    "unlockedUnitTypes": [
      "n_bomb_ketch"
    ]
  },
  {
    "advance": "unlock_dhow",
    "unlockedUnitTypes": [
      "n_dhow"
    ],
    "potential": {
      "region": [
        "arabia_region",
        "persia_region",
        "somalia_region",
        "egypt_region",
        "nubia_region",
        "ethiopia_region",
        "swahili_coast_region",
        "deccan_region",
        "western_india_region"
      ]
    }
  },
  {
    "advance": "unlock_traditional_galley_advance",
    "unlockedUnitTypes": [
      "n_traditional_galley"
    ]
  },
  {
    "advance": "unlock_m_galley_advance",
    "unlockedUnitTypes": [
      "n_mediterrannean_galley"
    ]
  },
  {
    "advance": "unlock_war_galley_advance",
    "unlockedUnitTypes": [
      "n_war_galley"
    ]
  },
  {
    "advance": "unlock_galleass_advance",
    "unlockedUnitTypes": [
      "n_galleass"
    ],
    "potential": {
      "cultureGroup": "italian_group"
    }
  },
  {
    "advance": "unlock_xebec_advance",
    "unlockedUnitTypes": [
      "n_xebec"
    ]
  },
  {
    "advance": "italian_galleass",
    "unlockedUnitTypes": [
      "n_italian_galleass"
    ],
    "potential": {
      "cultureGroup": "italian_group"
    }
  },
  {
    "advance": "unlock_archipelago_frigate",
    "unlockedUnitTypes": [
      "n_archipelago_frigate"
    ],
    "potential": {
      "region": [
        "scandinavian_region",
        "north_german_region",
        "baltic_region",
        "russian_region"
      ]
    }
  },
  {
    "advance": "unlock_cakradonya",
    "unlockedUnitTypes": [
      "n_cakradonya"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:acehnese_culture\",{\"merged_culture_group_contains_culture\":\"culture:acehnese_culture\"}]}}"
    }
  },
  {
    "advance": "unlock_galiot",
    "unlockedUnitTypes": [
      "n_galiot"
    ],
    "potential": {
      "region": [
        "iberia_region",
        "france_region",
        "italy_region",
        "maghreb_region",
        "balkan_region",
        "anatolia_region",
        "egypt_region",
        "crescent_region"
      ]
    }
  },
  {
    "advance": "unlock_sekibune",
    "unlockedUnitTypes": [
      "n_sekibune"
    ],
    "potential": {
      "cultureGroup": "japanese_group"
    }
  },
  {
    "advance": "unlock_atakebune",
    "unlockedUnitTypes": [
      "n_atakebune"
    ],
    "potential": {
      "cultureGroup": "japanese_group"
    }
  },
  {
    "advance": "unlock_long_fada",
    "unlockedUnitTypes": [
      "n_long_fada"
    ],
    "potential": {
      "raw": "{\"culture\":{\"OR\":{\"has_culture_group\":[\"culture_group:scottish_group\",\"culture_group:hibernian_group\"]}}}"
    }
  },
  {
    "advance": "unlock_long_fada_2",
    "unlockedUnitTypes": [
      "n_long_fada_2"
    ],
    "potential": {
      "raw": "{\"culture\":{\"OR\":{\"has_culture_group\":[\"culture_group:scottish_group\",\"culture_group:hibernian_group\"]}}}"
    }
  },
  {
    "advance": "unlock_cog_advance",
    "unlockedUnitTypes": [
      "n_cog"
    ]
  },
  {
    "advance": "unlock_hulk_advance",
    "unlockedUnitTypes": [
      "n_hulk"
    ]
  },
  {
    "advance": "unlock_flute_advance",
    "unlockedUnitTypes": [
      "n_flute"
    ]
  },
  {
    "advance": "unlock_brig_advance",
    "unlockedUnitTypes": [
      "n_brig"
    ]
  },
  {
    "advance": "unlock_merchantman_advance",
    "unlockedUnitTypes": [
      "n_merchantman"
    ]
  },
  {
    "advance": "unlock_eastindiaman_advance",
    "unlockedUnitTypes": [
      "n_eastindiaman"
    ]
  },
  {
    "advance": "unlock_legionaries_1_advance",
    "unlockedUnitTypes": [
      "a_legionaries_1"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_legionaries_2_advance",
    "unlockedUnitTypes": [
      "a_legionaries_2"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_legionaries_3_advance",
    "unlockedUnitTypes": [
      "a_legionaries_3"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_legionaries_4_advance",
    "unlockedUnitTypes": [
      "a_legionaries_4"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_legionaries_5_advance",
    "unlockedUnitTypes": [
      "a_legionaries_5"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_legionaries_6_advance",
    "unlockedUnitTypes": [
      "a_legionaries_6"
    ],
    "potential": {
      "tag": "ROM"
    }
  },
  {
    "advance": "unlock_varangians_2_advance",
    "unlockedUnitTypes": [
      "a_varangians_2"
    ],
    "potential": {
      "tag": "BYZ"
    }
  },
  {
    "advance": "unlock_varangians_3_advance",
    "unlockedUnitTypes": [
      "a_varangians_3"
    ],
    "potential": {
      "tag": "BYZ"
    }
  },
  {
    "advance": "unlock_varangians_4_advance",
    "unlockedUnitTypes": [
      "a_varangians_4"
    ],
    "potential": {
      "tag": "BYZ"
    }
  },
  {
    "advance": "unlock_varangians_5_advance",
    "unlockedUnitTypes": [
      "a_varangians_5"
    ],
    "potential": {
      "tag": "BYZ"
    }
  },
  {
    "advance": "unlock_varangians_6_advance",
    "unlockedUnitTypes": [
      "a_varangians_6"
    ],
    "potential": {
      "tag": "BYZ"
    }
  },
  {
    "advance": "unlock_byzantine_cataphracts_2_advance",
    "unlockedUnitTypes": [
      "a_byzantine_cataphracts_2"
    ],
    "potential": {
      "cultureGroup": "greek_group"
    }
  },
  {
    "advance": "unlock_byzantine_cataphracts_3_advance",
    "unlockedUnitTypes": [
      "a_byzantine_cataphracts_3"
    ],
    "potential": {
      "cultureGroup": "greek_group"
    }
  },
  {
    "advance": "unlock_byzantine_cataphracts_4_advance",
    "unlockedUnitTypes": [
      "a_byzantine_cataphracts_4"
    ],
    "potential": {
      "cultureGroup": "greek_group"
    }
  },
  {
    "advance": "unlock_byzantine_cataphracts_5_advance",
    "unlockedUnitTypes": [
      "a_byzantine_cataphracts_5"
    ],
    "potential": {
      "cultureGroup": "greek_group"
    }
  },
  {
    "advance": "unlock_byzantine_cataphracts_6_advance",
    "unlockedUnitTypes": [
      "a_byzantine_cataphracts_6"
    ],
    "potential": {
      "cultureGroup": "greek_group"
    }
  },
  {
    "advance": "akinji_cavalry",
    "unlockedUnitTypes": [
      "a_akinji"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "wagenburg",
    "unlockedUnitTypes": [
      "a_wagenburg"
    ],
    "potential": {
      "tag": "BOH"
    }
  },
  {
    "advance": "dahomey_amazons",
    "unlockedUnitTypes": [
      "a_dahomey_amazons"
    ],
    "potential": {
      "tag": "DAH"
    }
  },
  {
    "advance": "eng_red_coats",
    "unlockedUnitTypes": [
      "a_redcoats"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"ENG\",\"GBR\"]}}"
    }
  },
  {
    "advance": "eng_experimental_riflemen",
    "unlockedUnitTypes": [
      "a_experimental_riflemen"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"ENG\",\"GBR\"]}}"
    }
  },
  {
    "advance": "cawa_advance",
    "unlockedUnitTypes": [
      "a_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "a_renaissance_cawa_advance",
    "unlockedUnitTypes": [
      "a_renaissance_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "a_discovery_cawa_advance",
    "unlockedUnitTypes": [
      "a_discovery_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "a_reformation_cawa_advance",
    "unlockedUnitTypes": [
      "a_reformation_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "a_absolutism_cawa_advance",
    "unlockedUnitTypes": [
      "a_absolutism_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "a_revolutions_cawa_advance",
    "unlockedUnitTypes": [
      "a_revolutions_cawa"
    ],
    "potential": {
      "tag": "ETH"
    }
  },
  {
    "advance": "hun_found_the_black_army",
    "unlockedUnitTypes": [
      "a_the_black_army"
    ],
    "potential": {
      "tag": "HUN"
    }
  },
  {
    "advance": "hun_hungarian_hussars",
    "unlockedUnitTypes": [
      "a_hungarian_hussars"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:hungarian\",{\"merged_culture_group_contains_culture\":\"culture:hungarian\"},\"culture:szekely_culture\",{\"merged_culture_group_contains_culture\":\"culture:szekely_culture\"}]}}"
    }
  },
  {
    "advance": "ira_the_qizilbash",
    "unlockedUnitTypes": [
      "a_discovery_qizilbash"
    ],
    "potential": {
      "tag": "IRA"
    }
  },
  {
    "advance": "ira_the_ghilman",
    "unlockedUnitTypes": [
      "a_ghilman"
    ],
    "potential": {
      "tag": "IRA"
    }
  },
  {
    "advance": "ira_the_tofangchi",
    "unlockedUnitTypes": [
      "a_tofangchi"
    ],
    "potential": {
      "tag": "IRA"
    }
  },
  {
    "advance": "ira_the_tupchi",
    "unlockedUnitTypes": [
      "a_tupchi"
    ],
    "potential": {
      "tag": "IRA"
    }
  },
  {
    "advance": "ira_jazayerchi",
    "unlockedUnitTypes": [
      "a_jazayerchi"
    ],
    "potential": {
      "tag": "IRA"
    }
  },
  {
    "advance": "kbo_iron_helmet_musketeers",
    "unlockedUnitTypes": [
      "a_iron_helmet_musketeers"
    ],
    "potential": {
      "tag": "KBO"
    }
  },
  {
    "advance": "kor_hwachas_advance",
    "unlockedUnitTypes": [
      "a_hwacha"
    ],
    "potential": {
      "tag": "KOR"
    }
  },
  {
    "advance": "kor_early_turtle_ship_advance",
    "unlockedUnitTypes": [
      "n_early_turtle_ship"
    ],
    "potential": {
      "tag": "KOR"
    }
  },
  {
    "advance": "kor_geobukseon",
    "unlockedUnitTypes": [
      "n_turtle_ship"
    ],
    "potential": {
      "tag": "KOR"
    }
  },
  {
    "advance": "kor_panokseon_advance",
    "unlockedUnitTypes": [
      "n_panokseon"
    ],
    "potential": {
      "tag": "KOR"
    }
  },
  {
    "advance": "LIV_a_order_knights",
    "unlockedUnitTypes": [
      "a_order_knights"
    ],
    "potential": {
      "tag": "LIV"
    }
  },
  {
    "advance": "LIV_a_order_knights_2",
    "unlockedUnitTypes": [
      "a_order_knights_2"
    ],
    "potential": {
      "tag": "LIV"
    }
  },
  {
    "advance": "maj_home_of_the_sea_nomads",
    "unlockedUnitTypes": [
      "n_kabang"
    ],
    "potential": {
      "tag": "MAJ"
    }
  },
  {
    "advance": "maj_jong_advance",
    "unlockedUnitTypes": [
      "n_jong"
    ],
    "potential": {
      "tag": "MAJ"
    }
  },
  {
    "advance": "maj_late_karambit_warriors",
    "unlockedUnitTypes": [
      "a_late_karambit_warrior"
    ],
    "potential": {
      "tag": "MAJ"
    }
  },
  {
    "advance": "maj_the_magic_arrow",
    "unlockedUnitTypes": [
      "a_cetbang_cannon"
    ],
    "potential": {
      "tag": "MAJ"
    }
  },
  {
    "advance": "maj_the_ghali",
    "unlockedUnitTypes": [
      "n_madurese_gali"
    ],
    "potential": {
      "tag": "MAJ"
    }
  },
  {
    "advance": "kele_koun_advance",
    "unlockedUnitTypes": [
      "a_jonow_auxiliary"
    ],
    "potential": {
      "tag": "MAL"
    }
  },
  {
    "advance": "mandekalu_levies",
    "unlockedUnitTypes": [
      "a_mandekalu_infantry",
      "a_mandekalu_cavalry"
    ],
    "potential": {
      "tag": "MAL"
    }
  },
  {
    "advance": "sofa_levies_advance",
    "unlockedUnitTypes": [
      "a_sofa_infantry"
    ],
    "potential": {
      "tag": "MAL"
    }
  },
  {
    "advance": "farari_corps_advance",
    "unlockedUnitTypes": [
      "a_farari_infantry",
      "a_farari_cavalry"
    ],
    "potential": {
      "tag": "MAL"
    }
  },
  {
    "advance": "platoon_fire",
    "unlockedUnitTypes": [
      "a_mauricians"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"HOL\",\"NED\"]}}"
    }
  },
  {
    "advance": "winged_hussars_advance",
    "unlockedUnitTypes": [
      "a_winged_hussars"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"POL\",\"PLC\"]}}"
    }
  },
  {
    "advance": "late_winged_hussars_advance",
    "unlockedUnitTypes": [
      "a_late_winged_hussars"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"POL\",\"PLC\"]}}"
    }
  },
  {
    "advance": "home_of_hussars",
    "unlockedUnitTypes": [
      "a_serbian_hussars"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:serbian\",{\"merged_culture_group_contains_culture\":\"culture:serbian\"}]}}"
    }
  },
  {
    "advance": "hakkapelitta",
    "unlockedUnitTypes": [
      "a_hakkapelitta"
    ],
    "potential": {
      "raw": "{\"OR\":{\"has_or_had_tag\":[\"SWE\",\"FIN\"]}}"
    }
  },
  {
    "advance": "caroleans_advance",
    "unlockedUnitTypes": [
      "a_caroleans"
    ],
    "potential": {
      "tag": "SWE"
    }
  },
  {
    "advance": "a_renaissance_janissaries_advance",
    "unlockedUnitTypes": [
      "a_renaissance_janissaries"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "a_discovery_janissaries_advance",
    "unlockedUnitTypes": [
      "a_discovery_janissaries"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "a_reformation_janissaries_advance",
    "unlockedUnitTypes": [
      "a_reformation_janissaries"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "a_absolutism_janissaries_advance",
    "unlockedUnitTypes": [
      "a_absolutism_janissaries"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "a_revolutions_janissaries_advance",
    "unlockedUnitTypes": [
      "a_revolutions_janissaries"
    ],
    "potential": {
      "tag": "TUR"
    }
  },
  {
    "advance": "kilwan_trade_network",
    "unlockedUnitTypes": [
      "n_mtepe"
    ],
    "potential": {
      "tag": "ZAN"
    }
  },
  {
    "advance": "the_dhow",
    "unlockedUnitTypes": [
      "n_kilwan_dhow"
    ],
    "potential": {
      "tag": "ZAN"
    }
  },
  {
    "advance": "the_kilwan_zambuc",
    "unlockedUnitTypes": [
      "n_kilwan_zambuc"
    ],
    "potential": {
      "tag": "ZAN"
    }
  },
  {
    "advance": "the_red_cannon",
    "unlockedUnitTypes": [
      "a_red_cannon"
    ],
    "potential": {
      "tag": "CHI"
    }
  },
  {
    "advance": "hsa_the_cog",
    "unlockedUnitTypes": [
      "n_hanseatic_cog"
    ],
    "potential": {
      "tag": "HSA"
    }
  },
  {
    "advance": "khm_ballista_elephants",
    "unlockedUnitTypes": [
      "a_khmer_ballista_elephant_infantry"
    ],
    "potential": {
      "tag": "KHM"
    }
  },
  {
    "advance": "mamluk_soldiers",
    "unlockedUnitTypes": [
      "a_mamluk_unit_traditions",
      "a_mamluk_horsemen_traditions"
    ],
    "potential": {
      "tag": "MAM"
    }
  },
  {
    "advance": "mamluk_halqah",
    "unlockedUnitTypes": [
      "a_halqah_unit"
    ],
    "potential": {
      "tag": "MAM"
    }
  },
  {
    "advance": "reform_the_mamluk_corps",
    "unlockedUnitTypes": [
      "a_mamluk_unit_renaissance",
      "a_mamluk_horsemen_renaissance"
    ],
    "potential": {
      "tag": "MAM"
    }
  },
  {
    "advance": "black_guard",
    "unlockedUnitTypes": [
      "a_black_guard"
    ],
    "potential": {
      "tag": "MOR"
    }
  },
  {
    "advance": "ori_lord_of_elephants",
    "unlockedUnitTypes": [
      "a_orissan_elephant_cavalry"
    ],
    "potential": {
      "tag": "ORI"
    }
  },
  {
    "advance": "prussian_grenadiers",
    "unlockedUnitTypes": [
      "a_prussian_grenadiers"
    ],
    "potential": {
      "tag": "PRU"
    }
  },
  {
    "advance": "sia_advanced_elephant_warfare",
    "unlockedUnitTypes": [
      "a_siamese_advanced_elephant_cavalry"
    ],
    "potential": {
      "tag": "SIA"
    }
  },
  {
    "advance": "a_bedouin_cavalry_advance",
    "unlockedUnitTypes": [
      "a_bedouin_cavalry"
    ],
    "potential": {
      "cultureGroup": "arabian_group"
    }
  },
  {
    "advance": "bng_war_elephants",
    "unlockedUnitTypes": [
      "a_bengali_elephant_cavalry"
    ],
    "potential": {
      "raw": "{\"culture.language\":\"language:bengali_language\"}"
    }
  },
  {
    "advance": "landsknechte",
    "unlockedUnitTypes": [
      "a_landsknechte"
    ],
    "potential": {
      "cultureGroup": "german_group"
    }
  },
  {
    "advance": "saxon_defensioner",
    "unlockedUnitTypes": [
      "a_saxon_defensioner"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:saxon\",{\"merged_culture_group_contains_culture\":\"culture:saxon\"}]}}"
    }
  },
  {
    "advance": "bavarian_jager",
    "unlockedUnitTypes": [
      "a_bavarian_jager"
    ],
    "potential": {
      "tag": "BAV"
    }
  },
  {
    "advance": "hesse_jager",
    "unlockedUnitTypes": [
      "a_hesse_jager"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:rhine_franconian\",{\"merged_culture_group_contains_culture\":\"culture:rhine_franconian\"}]}}"
    }
  },
  {
    "advance": "austrian_grenzhussar",
    "unlockedUnitTypes": [
      "a_austrian_grenzhussar"
    ],
    "potential": {
      "tag": "HAB"
    }
  },
  {
    "advance": "austrian_grenzer",
    "unlockedUnitTypes": [
      "a_austrian_grenzer"
    ],
    "potential": {
      "tag": "HAB"
    }
  },
  {
    "advance": "gebirgsschutzen_infantry",
    "unlockedUnitTypes": [
      "a_gebirgsschutzen_infantry"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:southern_bavarian\",\"culture:danube_bavarian\",{\"merged_culture_group_contains_culture\":\"culture:southern_bavarian\"},{\"merged_culture_group_contains_culture\":\"culture:danube_bavarian\"}],\"is_swiss_for_advances\":true}}"
    }
  },
  {
    "advance": "swiss_reislaufer",
    "unlockedUnitTypes": [
      "a_reislaufer"
    ],
    "potential": {
      "raw": "{\"is_swiss_for_advances\":true}"
    }
  },
  {
    "advance": "mounted_people",
    "unlockedUnitTypes": [
      "a_iron_pagoda_cavalry",
      "a_light_jurchen_cavalry"
    ],
    "potential": {
      "cultureGroup": "jurchen_group"
    }
  },
  {
    "advance": "the_eight_banners",
    "unlockedUnitTypes": [
      "a_banner_cavalry"
    ],
    "potential": {
      "cultureGroup": "jurchen_group"
    }
  },
  {
    "advance": "npl_gurkhas",
    "unlockedUnitTypes": [
      "a_gurkha"
    ],
    "potential": {
      "tag": "NPL"
    }
  },
  {
    "advance": "thai_war_elephants",
    "unlockedUnitTypes": [
      "a_thai_elephant_cavalry"
    ],
    "potential": {
      "raw": "{\"OR\":{\"culture\":[\"culture:thai_culture\",{\"merged_culture_group_contains_culture\":\"culture:thai_culture\"}]}}"
    }
  },
  {
    "advance": "horse_lords",
    "unlockedUnitTypes": [
      "a_steppe_horse_archers",
      "a_a_urughs"
    ]
  },
  {
    "advance": "baghlah_advance",
    "unlockedUnitTypes": [
      "n_baghlah"
    ],
    "potential": {
      "raw": "{\"original_capital\":{\"EXISTS\":{\"OR\":{\"sub_continent\":[\"sub_continent:middle_east\",\"sub_continent:south_asia\"]}}}}"
    }
  },
  {
    "advance": "balkan_hajduks",
    "unlockedUnitTypes": [
      "a_hajduk"
    ],
    "potential": {
      "region": [
        "balkan_region",
        "carpathia_region"
      ],
      "cultureGroup": "south_slavic_group"
    }
  },
  {
    "advance": "cro_pandurs_recruitment",
    "unlockedUnitTypes": [
      "a_pandur"
    ],
    "potential": {
      "region": [
        "balkan_region",
        "carpathia_region"
      ],
      "cultureGroup": "south_slavic_group"
    }
  },
  {
    "advance": "tercio",
    "unlockedUnitTypes": [
      "a_tercio"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "catalan_galley",
    "unlockedUnitTypes": [
      "n_catalan_galley"
    ],
    "potential": {
      "tag": "ARA",
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "early_iberian_caravel",
    "unlockedUnitTypes": [
      "n_early_iberian_caravel"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "iberian_caravel",
    "unlockedUnitTypes": [
      "n_iberian_caravel"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "early_iberian_galleon",
    "unlockedUnitTypes": [
      "n_early_iberian_galleon"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "square_rigged_caravel",
    "unlockedUnitTypes": [
      "n_square_rigged_caravel"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "iberian_galleon",
    "unlockedUnitTypes": [
      "n_iberian_galleon"
    ],
    "potential": {
      "cultureGroup": "iberian_group"
    }
  },
  {
    "advance": "ara_catalan_crossbowmen",
    "unlockedUnitTypes": [
      "a_catalan_crossbowmen"
    ],
    "potential": {
      "tag": "ARA"
    }
  },
  {
    "advance": "cas_lanzas_de_castilla",
    "unlockedUnitTypes": [
      "a_lanzas_de_castilla"
    ],
    "potential": {
      "tag": "CAS"
    }
  },
  {
    "advance": "por_cacadores",
    "unlockedUnitTypes": [
      "a_cacadores"
    ],
    "potential": {
      "tag": "POR"
    }
  },
  {
    "advance": "genoese_crossbowmen",
    "unlockedUnitTypes": [
      "a_genoese_crossbowmen"
    ],
    "potential": {
      "tag": "GEN"
    }
  },
  {
    "advance": "genoese_galley",
    "unlockedUnitTypes": [
      "n_genoese_galley"
    ],
    "potential": {
      "tag": "GEN"
    }
  }
];
