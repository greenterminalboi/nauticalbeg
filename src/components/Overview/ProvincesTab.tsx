import { PerspectiveViewer } from "@perspective-dev/react";
import { tableFromIPC } from "apache-arrow";
import { listNationProvincesArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { humanizeKey } from "./countryNames";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import { usePerspectiveRows, type PerspectiveSchema } from "./usePerspectiveRows";
import "./ProvincesTab.css";

interface ProvincesTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

const SCHEMA: PerspectiveSchema = {
  province: "string",
  development: "float",
  tax_base: "float",
  population: "float",
  soldiers: "float",
  locations: "integer",
};

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

async function loadProvinceRows(db: SaveDatabase, nationIdx: number): Promise<Record<string, unknown>[]> {
  const buffer = await listNationProvincesArrow(db, nationIdx);
  return tableFromIPC(new Uint8Array(buffer))
    .toArray()
    .map((row) => {
      const r = row.toJSON();
      return {
        province: humanizeKey(String(r.name)),
        development: numberOrNull(r.development),
        tax_base: numberOrNull(r.tax_base),
        population: numberOrNull(r.population),
        soldiers: numberOrNull(r.soldiers),
        locations: Number(r.location_count),
      };
    });
}

/**
 * Factbook → Countries → Provinces (specs/018 US3): every province where
 * the nation owns land, with the same totals the Province map modes show
 * (development, tax base, population, soldiers summed over the whole
 * province) plus how many of its locations this nation owns. Perspective
 * datagrid: every column header sorts.
 */
export function ProvincesTab({ db, nationIdx }: ProvincesTabProps) {
  const state = usePerspectiveRows(db, `provinces-${nationIdx}`, SCHEMA, () => loadProvinceRows(db, nationIdx));

  if (state.kind === "error") return <NotAvailableState subject="province data" message={state.message} />;
  if (state.kind === "empty") return <EmptyState subject="provinces" />;

  return (
    <div className="provinces-tab">
      {state.kind === "ready" ? (
        <PerspectiveViewer
          className="provinces-tab__viewer"
          client={state.table}
          config={{ columns: Object.keys(SCHEMA), sort: [["development", "desc"]] }}
        />
      ) : (
        <p>Loading provinces…</p>
      )}
    </div>
  );
}
