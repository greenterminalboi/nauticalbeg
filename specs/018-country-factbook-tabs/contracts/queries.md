# Contract: storage queries (src/storage/queries.ts)

Every tab reads through these. No component builds SQL (architecture constitution). All take the session `db` and a nation idx.

| Function | Returns | Used by |
|---|---|---|
| `getCountryCard(db, nationIdx)` | `CountryCard` (data-model.md) | Overview |
| `getPopulationMakeup(db, nationIdx)` | `PopulationMakeup` | Overview |
| `loadNationHistory(db, idxs)` | existing, unchanged | History |
| `loadRulerHistory(db, idxs)` | existing, unchanged | History |
| `listNationProvincesArrow(db, nationIdx)` | Arrow IPC: `ProvinceRow` columns | Provinces (replaces `listProvincesArrow`) |
| `listNationLocations(db, nationIdx)` | `LocationRow[]` (terrain added in the component) | Locations |
| `loadMilitaryProfiles(db, idxs)` | army and navy summaries + doctrine points per nation | Military, Firepower |
| `listNationLaws(db, nationIdx)` | `{ lawCategory, object, date }[]` | Government |
| `listNationPrivileges(db, nationIdx)` | `{ object, date }[]` | Government |
| `listNationEstates(db, nationIdx)` | `{ available, rows: EstateRow[] }` | Estates |
| `decodeSocietalValuesByNation(db)` | existing, unchanged | Values |
| `listSubjectRelations(db)` | `{ available, rows: { overlordIdx, subjectIdx, subjectType, startDate }[] }` | Subjects |

Rules:
- A value the save lacks comes back `null`, never `0`, except where the data model defines a confirmed zero (debt with no loans, works of art with an empty owner set when the table has rows).
- Computed fields are listed in the result's `derived` set.
- `available: false` means the table is empty save-wide (a pre-018 kept save or share link). The UI shows "Not in this save's data — reload the save file".
