import { HoverTooltip } from "../Overview/HoverTooltip";
import type { Sourced } from "./battleSimData";

const BADGE_LABEL = { save: "save", default: "default", user: "edited" } as const;

export function SourceBadge<T>({ field, format }: { field: Sourced<T>; format: (v: T) => string }) {
  const badge = <span className={`sourced-badge sourced-badge--${field.source}`}>{BADGE_LABEL[field.source]}</span>;
  if (field.source !== "user") return badge;
  // Edited values show what they replaced (spec FR-004), via the app's
  // instant tooltip rather than a native `title` (FR-015).
  return (
    <HoverTooltip content={`Was ${format(field.original)} (${field.originalSource === "save" ? "from the save" : "game default"})`}>
      {badge}
    </HoverTooltip>
  );
}

export function ResetButton({ onReset, disabled, label }: { onReset: () => void; disabled: boolean; label: string }) {
  return (
    <button type="button" className="sourced-reset" onClick={onReset} disabled={disabled} aria-label={`Reset ${label}`}>
      ⟲
    </button>
  );
}

interface NumberFieldProps {
  label: string;
  field: Sourced<number>;
  onChange: (value: number) => void;
  onReset: () => void;
  error?: string;
  /** Display multiplier, e.g. 100 to show a 0.1 modifier as 10 (%). */
  scale?: number;
  step?: number;
  suffix?: string;
  compact?: boolean;
}

/** A number input with its save/default/edited badge, reset and inline error. */
export function NumberField({ label, field, onChange, onReset, error, scale = 1, step = 1, suffix, compact }: NumberFieldProps) {
  const shown = Number.isFinite(field.value) ? Math.round(field.value * scale * 1000) / 1000 : "";
  const format = (v: number) => `${Math.round(v * scale * 1000) / 1000}${suffix ?? ""}`;
  return (
    <label className={`sourced-field${compact ? " sourced-field--compact" : ""}${error ? " sourced-field--invalid" : ""}`}>
      {!compact && <span className="sourced-field__label">{label}</span>}
      <span className="sourced-field__control">
        <input
          type="number"
          step={step}
          value={shown}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value) / scale)}
        />
        {suffix && <span className="sourced-field__suffix">{suffix}</span>}
        <SourceBadge field={field} format={format} />
        <ResetButton onReset={onReset} disabled={field.source !== "user"} label={label} />
      </span>
      {error && <span className="sourced-field__error">{error}</span>}
    </label>
  );
}

interface SelectFieldProps<T extends string | null> {
  label: string;
  field: Sourced<T>;
  options: { value: T; label: string; group?: string }[];
  onChange: (value: T) => void;
  onReset: () => void;
  error?: string;
  compact?: boolean;
}

const NULL_OPTION = "__none__";

/** A select with its save/default/edited badge, reset and inline error. */
export function SelectField<T extends string | null>({ label, field, options, onChange, onReset, error, compact }: SelectFieldProps<T>) {
  const groups = new Map<string, typeof options>();
  for (const o of options) {
    const g = o.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  const labelOf = (v: T) => options.find((o) => o.value === v)?.label ?? String(v ?? "none");
  const renderOption = (o: (typeof options)[number]) => (
    <option key={o.value ?? NULL_OPTION} value={o.value ?? NULL_OPTION}>
      {o.label}
    </option>
  );
  return (
    <label className={`sourced-field${compact ? " sourced-field--compact" : ""}${error ? " sourced-field--invalid" : ""}`}>
      {!compact && <span className="sourced-field__label">{label}</span>}
      <span className="sourced-field__control">
        <select
          value={field.value ?? NULL_OPTION}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(e) => onChange((e.target.value === NULL_OPTION ? null : e.target.value) as T)}
        >
          {[...groups.entries()].map(([g, opts]) =>
            g ? (
              <optgroup key={g} label={g}>
                {opts.map(renderOption)}
              </optgroup>
            ) : (
              opts.map(renderOption)
            ),
          )}
        </select>
        <SourceBadge field={field} format={labelOf} />
        <ResetButton onReset={onReset} disabled={field.source !== "user"} label={label} />
      </span>
      {error && <span className="sourced-field__error">{error}</span>}
    </label>
  );
}

/** A checkbox with its save/default/edited badge and reset. */
export function CheckboxField({ label, field, onChange, onReset }: { label: string; field: Sourced<boolean>; onChange: (v: boolean) => void; onReset: () => void }) {
  return (
    <label className="sourced-field sourced-field--compact">
      <span className="sourced-field__control">
        <input type="checkbox" checked={field.value} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
        <SourceBadge field={field} format={(v) => (v ? "yes" : "no")} />
        <ResetButton onReset={onReset} disabled={field.source !== "user"} label={label} />
      </span>
    </label>
  );
}
