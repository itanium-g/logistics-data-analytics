import { describeMetricBasis, formatMetricValue } from "../../domain/format.ts";
import type { MetricMeta, MetricValue } from "../../shared/contracts.ts";

interface KpiCardProps {
  readonly metric: MetricValue;
  readonly meta: MetricMeta | undefined;
}

/**
 * One KPI. The definition and the supporting counts are always visible, so a
 * proxy metric or a small denominator is never presented as a bare percentage.
 */
export function KpiCard({ metric, meta }: KpiCardProps) {
  const basis = describeMetricBasis(metric);
  const undefinedValue = metric.value === null;

  return (
    <article className="kpi-card">
      <h3 className="kpi-label">{metric.label}</h3>
      <p className={undefinedValue ? "kpi-value kpi-value-undefined" : "kpi-value"}>
        {formatMetricValue(metric)}
      </p>
      {basis !== "" && <p className="kpi-basis">{basis}</p>}
      {meta !== undefined && (
        <details className="kpi-details">
          <summary>How this is calculated</summary>
          <p>{meta.definition}</p>
          {meta.assumptions.length > 0 && (
            <ul>
              {meta.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          )}
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
    <div className="kpi-grid">
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
