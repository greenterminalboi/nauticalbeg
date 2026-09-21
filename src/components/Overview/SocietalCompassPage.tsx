import { useEffect, useMemo, useState } from "react";
import type { SaveDatabase } from "../../storage/db";
import { computeDefaultSelection, loadLeaderboardCountries, type LeaderboardCountry } from "./leaderboardData";
import { decodeSocietalValuesByNation } from "./societalValuesData";
import { AXIS_CONFIG, computeCompassPosition, type AxisReading } from "./compassPosition";
import { SocietalCompassChart, type SocietalCompassPoint } from "./SocietalCompassChart";
import { SocietalCompassControls, type ColorMode } from "./SocietalCompassControls";
import { AddCountryInput } from "./AddCountryInput";
import "./SocietalCompassPage.css";

interface SocietalCompassPageProps {
  db: SaveDatabase;
}

interface LoadedData {
  countries: LeaderboardCountry[];
  readingsByNation: Map<number, AxisReading[]>;
}

function buildPoints(
  data: LoadedData,
  selectedIdxs: readonly number[],
  colorMode: ColorMode,
  colorAxis: string,
): SocietalCompassPoint[] {
  const { countries, readingsByNation } = data;
  const selectedSet = new Set(selectedIdxs);
  const countryByIdx = new Map(countries.map((c) => [c.idx, c]));
  const points: SocietalCompassPoint[] = [];
  for (const idx of selectedSet) {
    const country = countryByIdx.get(idx);
    if (!country) continue; // a selected idx that isn't a real/alive country -- nothing to plot
    const readings = readingsByNation.get(country.idx) ?? [];
    const position = computeCompassPosition(readings);
    // FR-015: a country with zero applicable axes is never plotted as
    // if it were a genuinely centrist country — excluded entirely.
    if (position.axisCount === 0) continue;
    const colorAxisReading =
      colorMode === "axis" ? readings.find((r) => r.axis === colorAxis) : undefined;
    points.push({
      nationIdx: country.idx,
      tag: country.tag,
      name: country.name ?? country.tag,
      x: position.x,
      y: position.y,
      axisCount: position.axisCount,
      colorRgb: country.color,
      colorAxisValue: colorAxisReading ? colorAxisReading.value / 100 : null,
      axisBreakdown: position.breakdown,
    });
  }
  return points;
}

const DEFAULT_COLOR_AXIS = AXIS_CONFIG[0].axis;

/**
 * specs/010-societal-values-compass: the compass's own page ("Societal
 * Compass" in the Encyclopedia/Factbook nav). Lands on the player's own
 * country/countries only (`computeDefaultSelection`, the same default
 * Leaderboard and World Goods use), with `AddCountryInput` to bring in
 * any other real country on demand — post-ship correction, explicit
 * user request, rather than plotting every country in the save at once.
 * Post-ship correction (explicit user request): no size-metric toggle —
 * every dot renders at a fixed size.
 */
export function SocietalCompassPage({ db }: SocietalCompassPageProps) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("country");
  const [colorAxis, setColorAxis] = useState<string>(DEFAULT_COLOR_AXIS);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setSelectedIdxs([]);
    setError(null);

    Promise.all([loadLeaderboardCountries(db), decodeSocietalValuesByNation(db)])
      .then(([countries, readingsByNation]) => {
        if (cancelled) return;
        setData({ countries, readingsByNation });
        setSelectedIdxs(computeDefaultSelection(countries));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Societal Values.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const points = useMemo(() => {
    if (!data) return null;
    return buildPoints(data, selectedIdxs, colorMode, colorAxis);
  }, [data, selectedIdxs, colorMode, colorAxis]);

  function toggleCountry(idx: number) {
    setSelectedIdxs((current) =>
      current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx],
    );
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!points || !data) {
    return <p>Loading Societal Values…</p>;
  }

  return (
    <div className="societal-compass-page">
      <p className="societal-compass-page__caption">
        Every selected country's ideological position, from its Societal Values.
      </p>
      <div className="societal-compass-page__controls">
        <SocietalCompassControls
          colorMode={colorMode}
          onSelectColorMode={setColorMode}
          colorAxis={colorAxis}
          onSelectColorAxis={setColorAxis}
        />
        <AddCountryInput
          countries={data.countries}
          selectedIdxs={selectedIdxs}
          onToggle={toggleCountry}
          placeholder="Search countries…"
        />
      </div>
      {points.length === 0 ? (
        <p>None of the selected countries have an applicable Societal Value axis yet.</p>
      ) : (
        <SocietalCompassChart
          points={points}
          colorMode={colorMode}
          colorAxisLabel={
            colorMode === "axis"
              ? AXIS_CONFIG.find((a) => a.axis === colorAxis)?.positivePoleLabel
              : undefined
          }
        />
      )}
    </div>
  );
}
