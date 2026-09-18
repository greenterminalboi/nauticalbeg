import type { PlayerNationOverview } from "../../storage/queries";
import "./OverviewCard.css";

interface OverviewCardProps {
  overview: PlayerNationOverview;
  inGameDate: string;
}

interface StatEntry {
  key: keyof PlayerNationOverview;
  label: string;
  value: string;
}

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/**
 * Renders all six FR-006 stats plus the nation's identity and date, with
 * FR-007's derived/raw distinction shown as a "computed" marker (T028) —
 * text, not color alone, per constitution Principle VI.
 */
export function OverviewCard({ overview, inGameDate }: OverviewCardProps) {
  const stats: StatEntry[] = [
    { key: "treasury", label: "Treasury", value: numberFormatter.format(overview.treasury) },
    { key: "stability", label: "Stability", value: numberFormatter.format(overview.stability) },
    { key: "governmentType", label: "Government", value: overview.governmentType || "Unknown" },
    {
      key: "totalDevelopment",
      label: "Total Development",
      value: numberFormatter.format(overview.totalDevelopment),
    },
    { key: "provinceCount", label: "Provinces", value: String(overview.provinceCount) },
    { key: "atWar", label: "War Status", value: overview.atWar ? "At War" : "At Peace" },
  ];

  return (
    <section className="overview-card" aria-label="Nation overview">
      <header className="overview-card__header">
        <p className="overview-card__eyebrow">Imperial Ledger</p>
        <h2 className="overview-card__title">{overview.name}</h2>
        <p className="overview-card__date">{inGameDate}</p>
      </header>
      <dl className="overview-card__stats">
        {stats.map((stat) => (
          <div className="overview-card__stat" key={stat.key}>
            <dt className="overview-card__stat-label">
              {stat.label}
              {overview.derived.has(stat.key) && (
                <span
                  className="overview-card__badge"
                  title="Computed from underlying save data, not read directly from a single field"
                >
                  computed
                </span>
              )}
            </dt>
            <dd className="overview-card__stat-value">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
