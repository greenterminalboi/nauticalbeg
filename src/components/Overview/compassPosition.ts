// specs/010-societal-values-compass: pure position-computation logic,
// kept separate from SocietalCompassChart/Page so it's testable without
// ECharts or a database connection.
import axisConfigJson from "./axisConfig.json";

export interface AxisConfigEntry {
  axis: string;
  angleDegrees: number;
  positivePoleLabel: string;
  negativePoleLabel: string;
  band: string;
  gatingNote?: string;
  provisional?: boolean;
}

export const AXIS_CONFIG = axisConfigJson as AxisConfigEntry[];

const AXIS_CONFIG_BY_KEY = new Map(AXIS_CONFIG.map((entry) => [entry.axis, entry]));

// Raw societal-value readings in the save run roughly -100..+100
// (research.md), normalized here to the -1.0..+1.0 scale the vector-sum
// projection (spec §5) is defined against.
const RAW_SCALE = 100;

export interface AxisReading {
  axis: string;
  value: number;
}

export interface CompassPosition {
  x: number;
  y: number;
  axisCount: number;
  /** Per-axis contribution, for the hover breakdown (FR-009). Only
   * axes present in both `axisConfig.json` and the country's readings. */
  breakdown: Array<{ axis: string; label: string; normalizedValue: number }>;
}

/**
 * Computes one country's compass position (spec §5) from its raw axis
 * readings. An axis absent from `readings` (not yet applicable, per
 * FR-005) is excluded from the sum entirely, never treated as 0. The
 * result is a mean vector (FR-006): the raw sum divided by the count of
 * applicable axes, so a country with fewer unlocked axes isn't pulled
 * toward the origin purely for having fewer terms.
 */
export function computeCompassPosition(readings: readonly AxisReading[]): CompassPosition {
  let sumX = 0;
  let sumY = 0;
  let axisCount = 0;
  const breakdown: CompassPosition["breakdown"] = [];

  for (const { axis, value } of readings) {
    const config = AXIS_CONFIG_BY_KEY.get(axis);
    if (!config) continue; // axis not part of the compass (e.g. a military-doctrine axis)

    const normalizedValue = value / RAW_SCALE;
    const angleRadians = (config.angleDegrees * Math.PI) / 180;
    // Post-ship correction (explicit user request, after reviewing the
    // live chart): y is negated relative to the raw unit circle so that
    // an angle near 90 degrees (Absolutism/Centralization's negative
    // poles, Liberalism/Decentralization's positive poles) pulls toward
    // the bottom of the chart, not the top — this is what makes the
    // corrected quadrant reading (Authoritarian Right top-right, Market
    // Libertarian bottom-right, State Collective top-left, Libertarian
    // Collective bottom-left) actually true of the plotted math, not
    // just the corner text.
    sumX += normalizedValue * Math.cos(angleRadians);
    sumY += -normalizedValue * Math.sin(angleRadians);
    axisCount += 1;
    breakdown.push({
      axis,
      label: normalizedValue >= 0 ? config.positivePoleLabel : config.negativePoleLabel,
      normalizedValue,
    });
  }

  if (axisCount === 0) {
    return { x: 0, y: 0, axisCount: 0, breakdown: [] };
  }

  return { x: sumX / axisCount, y: sumY / axisCount, axisCount, breakdown };
}
