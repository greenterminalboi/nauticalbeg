# Contract: snapshot container (`src/share/snapshotFormat.ts`)

## Bytes (before Brotli)

| Offset | Size | Content |
|---|---|---|
| 0 | 6 | ASCII `NBSNAP` |
| 6 | 2 | u16 LE format version (`1`) |
| 8 | 4 | u32 LE manifest length `M` |
| 12 | M | manifest, UTF-8 JSON |
| 12+M | … | the table streams, concatenated in manifest order; each is exactly `tables[i].bytes` long |

Manifest (format 1):

```json
{
  "appVersion": "e47c1db",
  "createdAt": "2026-09-25T15:00:00.000Z",
  "summary": { "inGameDate": "1657.1.3", "playerNationTag": "MOR" },
  "tables": [ { "name": "nations", "rows": 2471, "bytes": 349184, "columns": ["idx", "tag", "…"] } ]
}
```

## Export rules

- Every table in `information_schema.tables` (schema `main`) **except `raw_sections`**, as `SELECT * FROM <t>` → Arrow IPC **stream** format.
- Before encoding, `save_meta.filename` is replaced with `"Shared game"`.
- Tables are emitted in alphabetical order, so the output is deterministic and diffable in tests.

## Decode and import rules (strict, constitution III)

Decoding throws a typed `SnapshotError`:

| Kind | Raised when |
|---|---|
| `corrupt` | the magic is wrong, the manifest length points past the end, the manifest JSON is invalid, a table's bytes run past the end, there are leftover bytes, or a table's IPC fails to parse or its row count doesn't match `rows` |
| `incompatible` | the format version isn't `1`, a table isn't in the current schema, or a column isn't in its current table |

Import:
1. `applySchema`.
2. For each table: `insertArrowTable` into `tmp_<t>` (`create: true`), then `INSERT INTO <t> BY NAME SELECT * FROM tmp_<t>`, then `DROP tmp_<t>`.
3. Columns the current schema has but the snapshot lacks come out NULL; this is the additive-change tolerance.
4. Progress is reported per table, weighted by bytes.

Size guard: the decoder refuses a container over 1GB uncompressed (`corrupt`), as a guard against decompression bombs from a tampered object.
