# EU5 binary token table (`eu5.flat`)

Binary EU5 saves (the game's default format, including ironman and
multiplayer saves) store field names as 16-bit IDs. `eu5.flat` maps those
IDs back to names so the in-browser melter (`src/parser/melter/`) can turn
a binary save into the plaintext the parser reads.

## Provenance & permission

- **Source**: pdx.tools, `https://pdx.tools/assets/eu5-C4s2dwpt.bin`
  (fetched 2026-09-24).
- **Permission**: used **with permission from pdx.tools, granted to the
  project owner on 2026-09-24**. Paradox Interactive does not publish this
  table. The rakaly/jomini README notes it is withheld from that repo "per
  PDS counsel". If this permission is ever withdrawn, delete this file.
  Binary saves then fail with the `binary-unavailable` error, and text
  saves keep working.
- **Licensing boundary**: only this data file comes from pdx.tools. No
  pdx-tools code (AGPL-3.0) is used, including their compiled WASM and
  their `FlatResolver`. The melter is built from the MIT-licensed
  rakaly/jomini `eu5save` crate, and the reader for this file is our own
  (`tools/eu5-melter/src/tokens.rs`).

| File | Bytes | sha256 |
|---|---|---|
| original `eu5-C4s2dwpt.bin` (zstd) | 84,846 | `3630ea26ed3713051f0ab97076239f40d761feef84248bb421d17bb6fa3f2615` |
| `eu5.flat` (decompressed, committed) | 330,818 | `d2c200efefd980e33b99e371d615046c914b7bb5deea053b69e22091051cc3d5` |

## Layout

```
u16le  entryCount + 1   (23701)
u16le  breakpoint       (9999)
repeat: u8 len, len bytes UTF-8   (len = 0 means no token for that slot)
```

**ID rule**: `id ≤ breakpoint → entries[id]`; `id > breakpoint → entries[id - 1]`.
ID 9999 itself is not in the table. A plain `entries[id]` looks almost
right but silently shifts every high-range key by one slot; for example,
`player_country_name` becomes `shown_in_loading_screen`. Unit tests in
`tokens.rs` pin the correct rule.

## Version overrides

This table was generated from a newer game version than 1.3.11. At least
one ID was renamed since then (`0x28de`: `unused_strength` here,
`strength` in 1.3.11 saves). Per-version corrections live in
`src/parser/melter/token-overrides.ts`. When adding support for a new game
version, re-run `tools/eu5-melter/cross-check.mjs` against a real save of
that version to find any new overrides.
