# Quickstart: Validating Save Format Support

## Prerequisites

- Normal app work (`npm run dev`, `npm test`): nothing new. The melter WASM
  and token table are committed.
- Rebuilding the melter (`npm run build:melter`) needs:
  - rustup stable with the `wasm32-unknown-unknown` target:
    `~/.cargo/bin/rustup target add wasm32-unknown-unknown`
  - `cargo install wasm-bindgen-cli --version 0.2.128`
  - Note: Homebrew's `rustc` comes first on PATH and has no wasm target.
    `build.sh` puts `~/.cargo/bin` first.
- Real saves (local only, not committed):
  - Compressed binary: `~/Documents/Paradox Interactive/Europa Universalis V/save games/MP_RUS_1628_08_14_7a5f6d56-dd37-4edb-aa18-f35de833364a.eu5`
  - Melted text: `~/Downloads/Russia (Melted).eu5`
- `rakaly` 0.8.19 at `/opt/homebrew/bin/rakaly` for §4.

## 1. Automated tests

```sh
npm test                                   # includes save-format, melter, load-save equivalence
cd tools/eu5-melter && cargo test          # token-ID mapping (9998/10000/0x28de), quoting patch, encoder
```

Expected:
- All three generated fixtures (`.bin`, `.zip`, `.ztext`) produce the same
  stored rows as `rus-1628-minimal.eu5`.
- The damaged, truncated and unknown-kind fixtures produce `damaged-save` or
  `unrecognized-format`.

## 2. Plain text regression (US3, SC-004)

In `npm run dev`, load `Russia (Melted).eu5`. There should be no
`decompressing` phase, and results should be identical to before. Compare
load time against `main` (±5%).

## 3. Real compressed-binary save (US1, SC-001–SC-003)

1. Load the `MP_RUS_1628…eu5` file. You should see a `decompressing` phase
   with a moving percentage, then `parsing`, then ready. There should be no
   warning banner, because the spike found 0 unknown tokens.
2. Check that the Overview matches the melted save exactly: date 1628.8.14,
   nation Russia, and headline figures. Also check that the Firepower tab
   shows regiment strength. That tab exercises the `strength` override
   (research R4); without the override it's empty.
3. Record the load time and peak tab memory (Chrome Task Manager) for both
   files. The binary save must be ≤1.5× the melted file on both.
4. Cancel mid-`decompressing`. The loader should return to idle and leave no
   orphaned OPFS database.

## 4. Melter vs rakaly cross-check (whenever the token table, overrides, or supported game version change)

```sh
rakaly melt --to-stdout "$SAVE" > /tmp/r.eu5
node tools/eu5-melter/cross-check.mjs "$SAVE" /tmp/r.eu5
```

`cross-check.mjs` melts with the committed WASM and reports every
**key-name** difference. Quoting-only differences are ignored. Expected
result: none. Any key-name difference is either a new version override or a
token-table bug. Fix it before shipping.

## 5. Error paths (US4, SC-005)

- Truncate the binary save (`head -c 50000000 in.eu5 > cut.eu5`) and load
  it. Expect `damaged-save`.
- Load any `.zip` or `.png`. Expect `not-a-save`.
- Block `/tokens/eu5.flat` in DevTools (Network → Block request URL) and
  load the binary save. Expect `binary-unavailable`. Then load the melted
  save; it should still work.
