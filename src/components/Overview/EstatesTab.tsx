import { useEffect, useState } from "react";
import { listNationEstates, type EstateLastMonth, type EstateRow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";
import { estateName } from "./countryNames";
import { ESTATE_COLORS } from "./populationColors";
import "./EstatesTab.css";

interface EstatesTabProps {
  db: SaveDatabase;
  nationIdx: number;
}

const RELOAD_HINT = "Not in this save's data — reload the save file";
const NOT_TRACKED = "Not tracked";
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function number(value: number | null, format = oneDecimal): string {
  return value === null ? NOT_TRACKED : format.format(value);
}

function percent(share: number | null): string {
  return share === null ? NOT_TRACKED : `${oneDecimal.format(share * 100)}%`;
}

const INCOME: Array<[keyof EstateLastMonth, string]> = [
  ["taxableIncome", "Taxable Income"],
  ["uncontrolledIncome", "Uncontrolled Income"],
  ["cityIncome", "City Income"],
  ["tradeIncome", "Trade Income"],
  ["foodIncome", "Food Income"],
];
const EXPENSES: Array<[keyof EstateLastMonth, string]> = [
  ["paidTaxes", "Paid Taxes"],
  ["popExpense", "Pop Expenses"],
  ["buildingExpense", "Building Expenses"],
  ["rebelExpense", "Rebel Expenses"],
  ["investExpense", "Investments"],
  ["infraExpense", "Infrastructure"],
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="estates-tab__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EstateCard({ estate }: { estate: EstateRow }) {
  const name = estateName(estate.estateType);
  const [r, g, b] = ESTATE_COLORS[estate.estateType] ?? [116, 119, 126];
  const headingId = `estate-${estate.estateType}`;
  const hasLastMonth = Object.values(estate.lastMonth).some((v) => v !== null);
  const satisfaction = estate.satisfaction;

  return (
    <section className="estates-tab__card" aria-labelledby={headingId}>
      <header className="estates-tab__card-header" style={{ borderTopColor: `rgb(${r}, ${g}, ${b})` }}>
        <span className="estates-tab__swatch" style={{ background: `rgb(${r}, ${g}, ${b})` }} aria-hidden="true" />
        <h2 id={headingId} className="estates-tab__name">
          {name}
        </h2>
      </header>
      <dl className="estates-tab__stats">
        <div className="estates-tab__stat estates-tab__stat--wide">
          <dt>Satisfaction</dt>
          <dd>
            {percent(satisfaction)}
            {satisfaction !== null && (
              <span className="estates-tab__bar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(1, satisfaction)) * 100}%` }} />
              </span>
            )}
          </dd>
        </div>
        <Stat label="Tax Rate" value={percent(estate.taxRate)} />
        <Stat label="Population" value={percent(estate.populationShare)} />
        <Stat label="Gold" value={number(estate.gold)} />
        <Stat label="Monthly Balance" value={number(estate.balance)} />
        <Stat label="Wealth Impact" value={number(estate.wealthImpact, twoDecimals)} />
      </dl>
      <h3 className="estates-tab__subheading">Last Month</h3>
      {hasLastMonth ? (
        <div className="estates-tab__ledger">
          <dl className="estates-tab__stats">
            {INCOME.map(([key, label]) => (
              <Stat key={key} label={label} value={number(estate.lastMonth[key])} />
            ))}
          </dl>
          <dl className="estates-tab__stats">
            {EXPENSES.map(([key, label]) => (
              <Stat key={key} label={label} value={number(estate.lastMonth[key])} />
            ))}
          </dl>
        </div>
      ) : (
        <p className="estates-tab__hint">No income or expense record for this estate.</p>
      )}
    </section>
  );
}

/**
 * Factbook → Countries → Estates (specs/018 US7): one card per estate the
 * nation has, in the game's estate order, with its satisfaction, tax rate,
 * share of the population, gold, balance, wealth impact and last month's
 * income and expenses. A value the save doesn't record for an estate (the
 * crown has only satisfaction) says "Not tracked", never 0.
 */
export function EstatesTab({ db, nationIdx }: EstatesTabProps) {
  const [data, setData] = useState<{ idx: number; available: boolean; rows: EstateRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listNationEstates(db, nationIdx)
      .then((result) => {
        if (!cancelled) setData({ idx: nationIdx, ...result });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load estates.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, nationIdx]);

  if (error) return <p role="alert">{error}</p>;
  if (!data || data.idx !== nationIdx) return <p>Loading estates…</p>;
  if (!data.available) return <p className="estates-tab__hint">{RELOAD_HINT}</p>;
  if (data.rows.length === 0) return <p className="estates-tab__hint">This nation has no estates.</p>;

  return (
    <div className="estates-tab">
      {data.rows.map((estate) => (
        <EstateCard key={estate.estateType} estate={estate} />
      ))}
    </div>
  );
}
