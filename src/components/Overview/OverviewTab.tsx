import { useEffect, useState } from "react";
import {
  getCountryCard,
  getPopulationMakeup,
  type CountryCard,
  type PopulationMakeup,
  type PopulationSlice,
} from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { estateName, governmentPowerLabel, humanizeKey, popTypeName } from "./countryNames";
import { HoverTooltip } from "./HoverTooltip";
import { NotAvailableState } from "./NotAvailableState";
import { PopulationPie, type PieSlice } from "./PopulationPie";
import { ESTATE_COLORS, POP_TYPE_COLORS, type Rgb } from "./populationColors";
import "./OverviewTab.css";

interface OverviewTabProps {
  db: SaveDatabase;
  nationIdx: number;
  inGameDate: string;
}

const RELOAD_HINT = "Not in this save's data — reload the save file";
const NOT_AVAILABLE = "Not available";
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** How each computed stat is worked out (constitution IV: a derived value
 * says so, in text). */
const COMPUTED_EXPLANATIONS: Partial<Record<keyof CountryCard, string>> = {
  economicBase: "The latest yearly value in the country's economic base history.",
  literacy: "Average literacy of the pops living in the country's locations, weighted by pop size.",
  locationCount: "Number of locations the country owns.",
  worksOfArt: "Number of works of art the country owns that haven't been destroyed.",
  totalDebt: "Sum of every loan and government bond the country owes.",
};

function toPieSlices(
  slices: readonly PopulationSlice[],
  label: (s: PopulationSlice) => string,
  color: (s: PopulationSlice) => Rgb | null,
): PieSlice[] {
  return slices.map((s) => ({ key: s.key, label: label(s), size: s.size, color: color(s) }));
}

function formatNumber(value: number | null): string {
  return value === null ? NOT_AVAILABLE : numberFormatter.format(value);
}

interface Stat {
  key: keyof CountryCard;
  label: string;
  value: string;
}

function buildStats(card: CountryCard): Stat[] {
  return [
    { key: "governmentType", label: "Government", value: card.governmentType ? humanizeKey(card.governmentType) : NOT_AVAILABLE },
    { key: "treasury", label: "Treasury", value: formatNumber(card.treasury) },
    { key: "economicBase", label: "Economic Base", value: formatNumber(card.economicBase) },
    { key: "stability", label: "Stability", value: formatNumber(card.stability) },
    { key: "governmentPower", label: governmentPowerLabel(card.governmentType), value: formatNumber(card.governmentPower) },
    { key: "prestige", label: "Prestige", value: formatNumber(card.prestige) },
    {
      key: "worksOfArt",
      label: "Works of Art",
      value: card.available.worksOfArt ? formatNumber(card.worksOfArt) : RELOAD_HINT,
    },
    { key: "literacy", label: "Literacy", value: card.literacy === null ? NOT_AVAILABLE : `${card.literacy.toFixed(1)}%` },
    { key: "locationCount", label: "Locations", value: formatNumber(card.locationCount) },
    { key: "totalDebt", label: "Total Debt", value: card.available.loans ? formatNumber(card.totalDebt) : RELOAD_HINT },
    { key: "monthlyIncome", label: "Monthly Income", value: formatNumber(card.monthlyIncome) },
  ];
}

/**
 * Factbook → Countries → Overview (specs/018 US1): the selected nation's
 * country card and four population pies. Refetches when the nation
 * changes; a result for a nation no longer selected is dropped.
 */
export function OverviewTab({ db, nationIdx, inGameDate }: OverviewTabProps) {
  const [data, setData] = useState<{ idx: number; card: CountryCard; makeup: PopulationMakeup } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([getCountryCard(db, nationIdx), getPopulationMakeup(db, nationIdx)])
      .then(([card, makeup]) => {
        if (!cancelled) setData({ idx: nationIdx, card, makeup });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this country.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, nationIdx]);

  if (error) return <NotAvailableState subject="country data" message={error} />;
  if (!data || data.idx !== nationIdx) return null;
  const { card, makeup } = data;

  const pies: Array<{ title: string; slices: PieSlice[]; fold?: boolean }> = [
    {
      title: "Religion",
      slices: toPieSlices(makeup.religion, (s) => (s.name ? humanizeKey(s.name) : `Religion ${s.key}`), (s) => s.color),
    },
    {
      title: "Culture",
      slices: toPieSlices(makeup.culture, (s) => (s.name ? humanizeKey(s.name) : `Culture ${s.key}`), (s) => s.color),
    },
    {
      title: "Estates",
      slices: toPieSlices(makeup.estate, (s) => estateName(s.key), (s) => ESTATE_COLORS[s.key] ?? null),
      fold: false,
    },
    {
      title: "Social class",
      slices: toPieSlices(makeup.socialClass, (s) => popTypeName(s.key), (s) => POP_TYPE_COLORS[s.key] ?? null),
      fold: false,
    },
  ];

  return (
    <div className="overview-tab">
      <section className="overview-card" aria-label="Country card">
        <header className="overview-card__header">
          <p className="overview-card__eyebrow">Imperial Ledger</p>
          <h2 className="overview-card__title">{card.name}</h2>
          <p className="overview-card__date">{inGameDate}</p>
        </header>
        <dl className="overview-card__stats">
          {buildStats(card).map((stat) => (
            <div className="overview-card__stat" key={stat.key}>
              <dt className="overview-card__stat-label">
                {stat.label}
                {card.derived.has(stat.key) && (
                  <HoverTooltip content={COMPUTED_EXPLANATIONS[stat.key] ?? "Computed from several save values."}>
                    <span className="overview-card__badge">computed</span>
                  </HoverTooltip>
                )}
              </dt>
              <dd className="overview-card__stat-value">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="overview-tab__pies">
        {pies.map((pie) => (
          <PopulationPie key={pie.title} title={pie.title} slices={pie.slices} fold={pie.fold} />
        ))}
      </div>
    </div>
  );
}
