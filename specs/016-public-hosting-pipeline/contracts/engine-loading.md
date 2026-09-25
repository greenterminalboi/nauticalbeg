# Contract: DuckDB engine file selection (`src/storage/db.ts`)

## Behavior

| Build mode | `mainModule` (.wasm) | `mainWorker` (.js) |
|---|---|---|
| dev (`vite`) and tests | local file via `?url` import (as today) | local file via `?url` (as today) |
| production (`vite build`) | `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@<VERSION>/dist/duckdb-{mvp,eh}.wasm` | local file via `?url` (self-hosted) |

- `<VERSION>` is the exact installed `@duckdb/duckdb-wasm` version. It's read at build time from `node_modules/@duckdb/duckdb-wasm/package.json` and injected with Vite `define`, so the CDN URL can never drift from the JS glue it's paired with.
- The production build MUST NOT emit either `duckdb-*.wasm` into `dist/`. `check:dist` enforces this indirectly through the 25 MiB limit.
- `duckdb.selectBundle` still picks `eh` or `mvp` from the browser's features, unchanged.

## Failure

If the engine download fails (offline, or jsDelivr unreachable), the load fails with the loader's existing error surface and the message "Couldn't download the database engine. Check your connection and try again." It must never hang with an unchanging progress indicator (constitution V).

## Tests

`tests/storage/engine-urls.test.ts` checks that the URL-selection helper:
- returns local URLs when not in production
- returns jsDelivr URLs containing the pinned version in production
- produces the exact expected URL shape for both `mvp` and `eh`
