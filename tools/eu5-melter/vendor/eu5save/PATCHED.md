# Vendored `eu5save` — local modifications

Source: https://github.com/rakaly/jomini/tree/4461f6e41b28cf7888e2a849858029f9fe4b5a52/crates/eu5save
(MIT, see LICENSE.txt). Vendored 2026-09-24 for NauticalBeg feature 015.

## Changes vs upstream

1. `Cargo.toml` — workspace-inherited fields and `path` deps rewritten to
   standalone values / git deps pinned to the same rev; `tsify` feature
   declared empty; `tests/` and dev-dependencies dropped.
2. `src/melt.rs` — `write_lookup_str`: lookup-table strings written in
   key/value position are quoted when they contain whitespace or any of
   `={}"#`. Upstream writes them unquoted, producing e.g.
   `Custom_Name=Lil Israel` (138 occurrences in a real 1.3.11 MP save),
   which a text parser reads as `Custom_Name=Lil` plus a stray token.
   Exact diff: `../../patches/eu5save-quote-lookups.patch`.
   Covered by `tests::quotes_lookup_values_containing_spaces` in `src/lib.rs`.

## Upstream

Not yet reported. Suggested issue for rakaly/jomini:

> **eu5save melt: lookup strings containing spaces are written unquoted.**
> In `inner_melt`, `Token::Lookup` values (and pending lookups) go through
> `write_unquoted` unless `KeyHints::quote` matches the key. Custom country
> names from `string_lookup` such as `Lil Israel` therefore melt to
> `Custom_Name=Lil Israel`, which doesn't round-trip. `rakaly melt` 0.8.19
> writes `"Custom_Name"="Lil Israel"`. Suggest quoting whenever the string
> contains whitespace or `={}"#`.

Once fixed upstream, drop this vendor copy and depend on the git rev directly.
