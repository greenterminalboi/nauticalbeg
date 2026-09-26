import { PerspectiveViewer } from "@perspective-dev/react";
import { listNationLocations, type LocationRow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { humanizeKey } from "./countryNames";
import { EmptyState } from "./EmptyState";
import { LOCATION_TERRAIN } from "./locationTerrain";
import { NotAvailableState } from "./NotAvailableState";
import { usePerspectiveRows, type PerspectiveSchema } from "./usePerspectiveRows";
// Same framed datagrid as the Provinces tab.
import "./ProvincesTab.css";

interface LocationsTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

const SCHEMA: PerspectiveSchema = {
  location: "string",
  province: "string",
  terrain: "string",
  rank: "string",
  development: "float",
  population: "float",
  tax_base: "float",
  soldiers: "float",
  control: "float",
  controller: "string",
  raw_good: "string",
  market: "string",
  culture: "string",
  religion: "string",
};

function readable(key: string | null): string | null {
  return key === null ? null : humanizeKey(key);
}

/** One table row per location; names are made readable, and control is
 * shown as a percentage (the save stores 0..1). */
export function toLocationTableRow(row: LocationRow): Record<string, unknown> {
  const terrain = row.name === null ? undefined : LOCATION_TERRAIN[row.name];
  return {
    location: row.name === null ? `Location ${row.idx}` : humanizeKey(row.name),
    province: readable(row.provinceName),
    terrain: terrain === undefined ? null : humanizeKey(terrain),
    rank: readable(row.rank),
    development: row.development,
    population: row.population,
    tax_base: row.taxBase,
    soldiers: row.soldiers,
    control: row.control === null ? null : row.control * 100,
    controller: row.controllerName,
    raw_good: readable(row.rawMaterial),
    market: readable(row.marketName),
    culture: readable(row.cultureName),
    religion: readable(row.religionName),
  };
}

/**
 * Factbook → Countries → Locations (specs/018 US4): every location the
 * nation owns, with the location-level values the map modes show. Terrain
 * comes from the same static lookup the map's terrain layer uses.
 */
export function LocationsTab({ db, nationIdx }: LocationsTabProps) {
  const state = usePerspectiveRows(db, `locations-${nationIdx}`, SCHEMA, async () =>
    (await listNationLocations(db, nationIdx)).map(toLocationTableRow),
  );

  if (state.kind === "error") return <NotAvailableState subject="location data" message={state.message} />;
  if (state.kind === "empty") return <EmptyState subject="locations" />;

  return (
    <div className="provinces-tab">
      {state.kind === "ready" ? (
        <PerspectiveViewer
          className="provinces-tab__viewer"
          client={state.table}
          config={{ columns: Object.keys(SCHEMA), sort: [["development", "desc"]] }}
        />
      ) : (
        <p>Loading locations…</p>
      )}
    </div>
  );
}
