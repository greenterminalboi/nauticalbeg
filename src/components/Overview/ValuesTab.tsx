import { useEffect, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { decodeSocietalValuesByNation } from "./societalValuesData";
import { humanizeKey } from "./countryNames";
import axisConfig from "./axisConfig.json";
import "./ValuesTab.css";

interface ValuesTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

interface AxisInfo {
  axis: string;
  negative: string;
  positive: string;
  gatingNote?: string;
}

const CONFIGURED = new Map<string, AxisInfo>(
  (axisConfig as Array<{ axis: string; negativePoleLabel: string; positivePoleLabel: string; gatingNote?: string }>).map(
    (a) => [a.axis, { axis: a.axis, negative: a.negativePoleLabel, positive: a.positivePoleLabel, gatingNote: a.gatingNote }],
  ),
);

/** Pole names from the Societal Compass config, or from the axis key
 * itself (`land_vs_naval` → Land, Naval) for axes it doesn't cover. */
function axisInfo(axis: string): AxisInfo {
  const configured = CONFIGURED.get(axis);
  if (configured) return configured;
  const [negative, positive] = axis.split("_vs_");
  return { axis, negative: humanizeKey(negative), positive: humanizeKey(positive ?? "") };
}

/** Compass axes first, in their configured order, then any others. */
function order(axes: Iterable<string>): string[] {
  const configured = [...CONFIGURED.keys()];
  return [...new Set(axes)].sort((a, b) => {
    const ia = configured.indexOf(a);
    const ib = configured.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return a.localeCompare(b);
  });
}

function describe(value: number, info: AxisInfo): string {
  const magnitude = Math.round(Math.abs(value));
  if (magnitude === 0) return "Balanced";
  return `${magnitude} toward ${value < 0 ? info.negative : info.positive}`;
}

/**
 * Factbook → Countries → Values (specs/018 US8): the selected nation's
 * societal values, each shown between its two poles (-100 to +100). An
 * axis the nation doesn't have yet (the save's "not applicable") is
 * listed separately, never drawn as a neutral reading.
 */
export function ValuesTab({ db, nationIdx }: ValuesTabProps) {
  const [readings, setReadings] = useState<Map<number, { axis: string; value: number }[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    decodeSocietalValuesByNation(db)
      .then((loaded) => {
        if (!cancelled) setReadings(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load societal values.");
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  if (error) return <p role="alert">{error}</p>;
  if (!readings) return <p>Loading societal values…</p>;

  const own = new Map((readings.get(nationIdx) ?? []).map((r) => [r.axis, r.value]));
  if (own.size === 0) return <p className="values-tab__hint">This nation has no societal values.</p>;
  const allAxes = [...CONFIGURED.keys(), ...[...readings.values()].flat().map((r) => r.axis)];
  const applicable = order(own.keys());
  const notApplicable = order(allAxes).filter((axis) => !own.has(axis));

  return (
    <div className="values-tab">
      <ul className="values-tab__list">
        {applicable.map((axis) => {
          const info = axisInfo(axis);
          const value = own.get(axis)!;
          const label = `${info.negative} vs ${info.positive}`;
          const position = ((Math.max(-100, Math.min(100, value)) + 100) / 200) * 100;
          return (
            <li key={axis} className="values-tab__axis">
              <div className="values-tab__poles">
                <span>{info.negative}</span>
                <span className="values-tab__reading">{describe(value, info)}</span>
                <span>{info.positive}</span>
              </div>
              <div
                className="values-tab__track"
                role="meter"
                aria-label={label}
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={value}
                aria-valuetext={describe(value, info)}
              >
                <span className="values-tab__center" aria-hidden="true" />
                <span className="values-tab__marker" style={{ left: `${position}%` }} aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>
      {notApplicable.length > 0 && (
        <section className="values-tab__not-applicable" aria-labelledby="values-not-applicable">
          <h2 id="values-not-applicable" className="values-tab__heading">
            Not applicable
          </h2>
          <ul>
            {notApplicable.map((axis) => {
              const info = axisInfo(axis);
              return (
                <li key={axis}>
                  {info.negative} vs {info.positive}
                  {info.gatingNote && <span className="values-tab__hint"> — {info.gatingNote}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
