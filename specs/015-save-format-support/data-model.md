# Data Model: Save Format Support

This feature adds no database tables or columns. Its entities are transient
parse-time structures that live in the parser Worker, plus one shipped
asset.

## SaveFormat

Derived from the save header (research R1). Produced by
`src/parser/save-format.ts`.

| Field | Type | Notes |
|---|---|---|
| `headerVersion` | number | hex digits 3–5 (`02` on current saves) |
| `kindCode` | number | hex digits 5–7 |
| `encoding` | `"text" \| "binary"` | from `kindCode` |
| `container` | `"plain" \| "unified-zip" \| "split-zip"` | from `kindCode` |
| `metadataLength` | number | hex digits 15–23 |

**Validation**:
- The first 3 bytes must be `SAV`, otherwise `not-a-save`.
- The hex fields must parse and a `\n` must fall within the first 33 bytes, otherwise `damaged-save`.
- `kindCode ∉ 0..5` → `unrecognized-format`.

**Routing**: `kindCode === 0` → existing text path (no melter). Every other
code goes to the melter.

## TokenTable (shipped asset `public/tokens/eu5.flat`)

| Part | Layout |
|---|---|
| header | `u16le entryCount+1` (23701), `u16le breakpoint` (9999) |
| entries | repeated `u8 len`, `len` UTF-8 bytes; `len = 0` means no token |

**Resolution rule** (research R3, must be unit-tested):
`id ≤ breakpoint → entries[id]`; `id > breakpoint → entries[id - 1]`.

**Provenance**: `public/tokens/README.md` records:
- the source URL
- the original `.bin` sha256 `3630ea26…2615` and the decompressed sha256 `d2c200ef…c3d5`
- the fetch date
- the pdx.tools permission (2026-09-24)

## TokenOverrides (`src/parser/melter/token-overrides.ts`)

`Record<gameVersion, Record<tokenId, name>>`, applied on top of TokenTable.

| Game version | Token | Name | Why |
|---|---|---|---|
| `1.3.11` | `0x28de` | `strength` | pdx.tools table names it `unused_strength` (later game version); 1.3.11 saves and the adapter use `strength` (research R4) |

Selection: by `metadata.version` from a metadata-only melt (research R6).
If there's no entry for the version, no overrides are applied. The adapter
registry then decides whether the version is supported at all.

## MeltResult

Returned by `src/parser/melter/melt.ts`.

| Field | Type | Notes |
|---|---|---|
| `text` | `Uint8Array` | melted plaintext, `SAV…00` header + body; fed to existing `detectVersion`/adapter |
| `unknownTokenCount` | number | distinct unresolved token IDs; written as `__unknown_0x…` keys (FR-009) |
| `unknownLookupCount` | number | distinct unresolved string-lookup indices; written as `__id_0x…` |

## LoadWarning (new, on the `ready` message)

| Field | Type | Notes |
|---|---|---|
| `kind` | `"unknown-tokens"` | only kind for now |
| `count` | number | `unknownTokenCount + unknownLookupCount` |
| `message` | string | player-facing, e.g. "12 fields in this save weren't recognized; some data may be incomplete." |

Emitted only when `count > 0`. It never blocks `ready`.

## Load stage (progress phases)

`validating` (reading file) → **`decompressing`** (new; melter running,
binary/zip only) → `detecting-version` → `parsing`.

`decompressing` percent is `outputBytesWritten / estimatedOutputBytes`,
where the estimate is `2.2 × uncompressed gamestate size` from the zip
directory, or `8 × file size` for uncompressed binary. It's capped at 99
until the melt returns.
