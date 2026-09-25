// Per-game-version corrections applied on top of pdx.tools' EU5 token
// table (public/tokens/eu5.flat) before melting — see
// specs/015-save-format-support/research.md §R4.
//
// The table was generated from a newer game version than some saves we
// support, and PDS occasionally renames a field while keeping its token ID.
// Diffing a real 1.3.11 save melted with this table against `rakaly melt`
// (40.2M lines) found exactly one such rename. Re-run
// tools/eu5-melter/cross-check.mjs whenever a game version is added here
// or to the adapter registry.
export const TOKEN_OVERRIDES: Record<string, Record<number, string>> = {
  "1.3.11": {
    // pdx.tools' table: `unused_strength`. 1.3.11 saves (and the adapter's
    // `subunit.strength` read in version-adapters/1.3.11.ts) use `strength`
    // — without this, the Firepower tab's regiment strength is silently empty.
    0x28de: "strength",
  },
};
