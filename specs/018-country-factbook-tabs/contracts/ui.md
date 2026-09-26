# Contract: Countries tab UI

## Side nav

`SideNav` renders these `TabId`s, in order, with these labels:

| TabId | Label | Component |
|---|---|---|
| `overview` | Overview | `OverviewTab` |
| `history` | History | `HistoryTab` |
| `provinces` | Provinces | `ProvincesTab` |
| `locations` | Locations | `LocationsTab` |
| `military` | Military | `MilitaryTab` |
| `government` | Government | `GovernmentTab` |
| `estates` | Estates | `EstatesTab` |
| `values` | Values | `ValuesTab` |
| `subjects` | Subjects | `SubjectsTab` |
| `economy` | Economy | `ComingSoonPlaceholder` |
| `buildings` | Building Registry | `ComingSoonPlaceholder` |
| `characters` | Characters | `ComingSoonPlaceholder` |

`trade` and `diplomacy` no longer exist.

## Props every tab takes

`{ db: SaveDatabase; nationIdx: number }`. A tab refetches when `nationIdx` changes and discards a result that arrives for a nation no longer selected.

`SubjectsTab` also takes `onOpenNation(idx: number)`. `FileLoader` implements it as: set the selected nation to `idx`, set the active tab to `overview`.

`HistoryTab` resets its comparison selection to `[nationIdx]` whenever `nationIdx` changes.

## Accessible names (tests query by these)

- Overview card: `section` named "Country card". Pies: each a `figure` with caption "Religion", "Culture", "Estates", "Social class".
- Subjects: a `region` named "Subjects of <nation name>" holding nested lists (subjects of subjects nested under their overlord); each clickable subject is a `button` whose name includes the subject's name and type. *(Changed during implementation: a full ARIA `tree` needs arrow-key navigation; plain nested lists of buttons are reachable with Tab and need none.)*
- Government: headings "Policies" and "Estate Privileges".
