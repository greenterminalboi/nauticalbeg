import { useEffect, useState } from "react";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { Table } from "@perspective-dev/client";
import { getPerspectiveWorker } from "../../perspective/setup";
import { listWarsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { EmptyState } from "./EmptyState";
import { NotAvailableState } from "./NotAvailableState";
import "./WarsTab.css";

interface WarsTabProps {
  db: SaveDatabase;
}

/**
 * Encyclopedia's Wars tab (decision 2026-09-19) — every war in the save,
 * via a Perspective datagrid (same pattern as ProvincesTab). Unlike
 * Provinces, this is NOT scoped to a selected nation: a war belongs to
 * no single country, which is exactly why Wars is a peer of Countries
 * in Encyclopedia's sub-nav rather than nested under it.
 *
 * Columns surfaced (per explicit product direction — "if I was a player
 * and I wanted information about a war, what would I look at"):
 * attacker, defender, status/duration, war score on each side, and
 * casualties on each side. Selecting a row to open a detailed single-war
 * view is planned but explicitly out of scope for this pass.
 *
 * `start_date`/`end_date` are EU5's own non-zero-padded "Y.M.D" text
 * (schema.sql's existing convention) — a known, pre-existing limitation
 * shared with every other date field in this app: lexicographic sort
 * within the same year across different-width months/days isn't always
 * chronologically correct (e.g. "1628.10.5" sorts before "1628.2.1" as
 * plain text). Real for both fixture wars here by coincidence; revisit
 * with a real DATE column if this proves confusing in practice.
 */
export function WarsTab({ db }: WarsTabProps) {
  const [table, setTable] = useState<Table | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdTable: Table | null = null;
    setTable(null);
    setIsEmpty(false);
    setError(null);

    (async () => {
      const [worker, arrowBuffer] = await Promise.all([getPerspectiveWorker(), listWarsArrow(db)]);
      if (cancelled) return;
      createdTable = await worker.table(arrowBuffer, { name: "wars" });
      const size = await createdTable.size();
      if (cancelled) {
        createdTable.delete({ lazy: true });
        return;
      }
      if (size === 0) {
        createdTable.delete({ lazy: true });
        setIsEmpty(true);
        return;
      }
      setTable(createdTable);
    })().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load wars.");
      }
    });

    return () => {
      cancelled = true;
      createdTable?.delete({ lazy: true });
    };
  }, [db]);

  if (error) {
    return <NotAvailableState subject="war data" message={error} />;
  }
  if (isEmpty) {
    return <EmptyState subject="wars" message="This save has no recorded wars." />;
  }

  return (
    <div className="wars-tab">
      {table ? (
        <PerspectiveViewer
          className="wars-tab__viewer"
          client={table}
          config={{
            sort: [["start_date", "desc"]],
            columns: [
              "attacker",
              "defender",
              "is_ongoing",
              "start_date",
              "end_date",
              "duration_days",
              "attacker_score",
              "defender_score",
              "attacker_casualties",
              "defender_casualties",
              "war_type",
            ],
          }}
        />
      ) : (
        <p>Loading wars…</p>
      )}
    </div>
  );
}
