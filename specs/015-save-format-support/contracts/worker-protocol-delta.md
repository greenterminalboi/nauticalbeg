# Contract Delta: Main Thread ↔ Parser Worker

These are additions to `specs/001-save-import-overview/contracts/worker-protocol.md`,
mirrored in `src/parser/protocol.ts`. They are backward-compatible
additions only: existing messages and fields keep their meaning.

## `progress.phase`: one new value

`"validating" | "decompressing" | "detecting-version" | "parsing"`

`decompressing` is sent only for non-plain-text saves, while the melter
runs. It follows the same once-per-second rule; `percent` is described in
data-model "Load stage".

## `error.kind`: three new values

| Kind | When | Player-facing message (ErrorMessage.tsx) |
|---|---|---|
| `unrecognized-format` | header kind code not 0–5 | "This save uses a format NauticalBeg doesn't recognize. It may come from a newer game version." |
| `damaged-save` | bad header, truncated file, bad zip, missing gamestate, early EOF in binary, WASM trap, size cap | "This save file appears damaged or incomplete. Try copying it again from your EU5 save games folder." |
| `binary-unavailable` | token table or melter asset failed to load | "Ironman and binary saves can't be read right now. You can still load a text save (a debug-mode save, or one converted with rakaly melt)." |

Existing kinds (`not-a-save`, `unsupported-version`, `parse-failed`) are
unchanged.

## `ready`: one new optional field

```ts
warnings?: LoadWarning[]   // see data-model.md; omitted when empty
```

The main thread shows it as a dismissible, non-blocking notice. It never
changes which tabs render.

## Rules (unchanged)

- Exactly one terminal message (`error` or `ready`) per `load`.
- Cancel during `decompressing` behaves exactly like cancel during
  `parsing`: no terminal message, and any partial state is cleaned up.
