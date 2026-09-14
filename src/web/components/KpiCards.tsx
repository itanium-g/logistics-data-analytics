import { describeMetricBasis, formatMetricValue } from "../../domain/format.ts";
import type { MetricMeta, MetricValue } from "../../shared/contracts.ts";

interface KpiCardProps {
  readonly metric: MetricValue;
  readonly meta: MetricMeta | undefined;
}

/** One KPI with its honest basis and metric-specific definition disclosure. */
export function KpiCard({ metric, meta }: KpiCardProps) {
  const basis = describeMetricBasis(metric);
  const unavailable = metric.value === null;
  const detailsId = `kpi-definition-${metric.metric}`;

  return (
    <article className={`kpi-card${unavailable ? " kpi-card-unavailable" : ""}`} data-metric={metric.metric}>
      <div className="kpi-card-header">
        <span className="kpi-mark" aria-hidden="true" />
        <h3 className="kpi-label">{metric.label}</h3>
      </div>
      <p className={`kpi-value${unavailable ? " kpi-value-undefined" : ""}`}>
        {formatMetricValue(metric)}
      </p>
      {basis !== "" ? (
        <p className="kpi-basis">
          <span className="kpi-basis-label">Basis</span> {basis}
        </p>
      ) : (
        <p className="kpi-basis kpi-basis-empty">Whole analytical scope</p>
      )}
      {meta !== undefined && (
        <details className="kpi-details">
          <summary aria-controls={detailsId}>
            <span>Definition &amp; assumptions</span>
          </summary>
          <div id={detailsId}>
            <p>{meta.definition}</p>
            {meta.assumptions.length > 0 && (
              <ul>
                {meta.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

interface KpiGridProps {
  readonly metrics: readonly MetricValue[];
  readonly metricMeta: readonly MetricMeta[];
}

export function KpiGrid({ metrics, metricMeta }: KpiGridProps) {
  return (
    <div className="kpi-grid" aria-label="Five tracked metrics">
      {metrics.map((metric) => (
        <KpiCard
          key={metric.metric}
          metric={metric}
          meta={metricMeta.find((entry) => entry.id === metric.metric)}
        />
      ))}
    </div>
  );
}
