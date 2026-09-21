import { GoodSelect } from "./GoodSelect";
import { AXIS_CONFIG } from "./compassPosition";
import "./SocietalCompassControls.css";

export type ColorMode = "country" | "axis";

interface SocietalCompassControlsProps {
  colorMode: ColorMode;
  onSelectColorMode: (mode: ColorMode) => void;
  colorAxis: string;
  onSelectColorAxis: (axis: string) => void;
}

const AXIS_LABEL_BY_KEY = new Map(
  AXIS_CONFIG.map((a) => [a.axis, `${a.negativePoleLabel} / ${a.positivePoleLabel}`]),
);
const AXIS_KEY_BY_LABEL = new Map(
  AXIS_CONFIG.map((a) => [`${a.negativePoleLabel} / ${a.positivePoleLabel}`, a.axis]),
);
const AXIS_LABELS = AXIS_CONFIG.map((a) => `${a.negativePoleLabel} / ${a.positivePoleLabel}`);

/**
 * specs/010-societal-values-compass User Story 2: the color-mode
 * toggle, plus the "color by axis" sub-picker (reusing `GoodSelect` —
 * a generic searchable-list combobox, not goods-specific despite the
 * name history). Post-ship correction (explicit user request): the
 * size-metric toggle (population / total development) was removed
 * entirely — dots render at a fixed size now.
 */
export function SocietalCompassControls({
  colorMode,
  onSelectColorMode,
  colorAxis,
  onSelectColorAxis,
}: SocietalCompassControlsProps) {
  return (
    <div className="societal-compass-controls">
      <div className="societal-compass-controls__group" role="group" aria-label="Dot color">
        <button
          type="button"
          className={
            colorMode === "country"
              ? "societal-compass-controls__toggle societal-compass-controls__toggle--active"
              : "societal-compass-controls__toggle"
          }
          onClick={() => onSelectColorMode("country")}
        >
          Country Color
        </button>
        <button
          type="button"
          className={
            colorMode === "axis"
              ? "societal-compass-controls__toggle societal-compass-controls__toggle--active"
              : "societal-compass-controls__toggle"
          }
          onClick={() => onSelectColorMode("axis")}
        >
          By Axis
        </button>
      </div>
      {colorMode === "axis" && (
        <GoodSelect
          goods={AXIS_LABELS}
          selectedGood={AXIS_LABEL_BY_KEY.get(colorAxis) ?? AXIS_LABELS[0]}
          onSelectGood={(label) => {
            const axis = AXIS_KEY_BY_LABEL.get(label);
            if (axis) onSelectColorAxis(axis);
          }}
          placeholder="Search Societal Value axes…"
        />
      )}
    </div>
  );
}
