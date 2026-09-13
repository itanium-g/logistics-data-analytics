import { useCallback, useEffect, useState } from "react";
import type { QueryRequestInput } from "../domain/query-schema.ts";
import { describeScope } from "../domain/format.ts";
import type { Dimension, MetaResponse, QueryResponse } from "../shared/contracts.ts";
import { ApiError, postQuery } from "./api.ts";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import {
  DEFAULT_SCOPE,
  FilterBar,
  scopeSummary,
  type DashboardScope,
} from "./components/FilterBar.tsx";
import { KpiGrid } from "./components/KpiCards.tsx";
import { ResultChart } from "./components/ResultChart.tsx";

interface DashboardData {
  readonly counts: QueryResponse;
  readonly rates: QueryResponse;
  readonly monthly: QueryResponse;
  readonly statuses: QueryResponse;
}

/** Request-shaped filters. The request type uses mutable arrays. */
function toFilters(scope: DashboardScope): { field: Dimension; op: "eq"; values: string[] }[] {
  return Object.entries(scope.selections).map(([field, value]) => ({
    field: field as Dimension,
    op: "eq" as const,
    values: [value],
  }));
}

/**
 * Every panel shares one scope, so a card and a chart can never describe
 * different populations. The contract allows at most three metrics per request,
 * so the five required KPIs are fetched as two requests over the same scope.
 */
function buildRequests(scope: DashboardScope): Readonly<Record<keyof DashboardData, QueryRequestInput>> {
  const shared = {
    date_context: scope.date_context,
    date_field: scope.date_field,
    relative_range: scope.relative_range,
    filters: toFilters(scope),
  };

  return {
    counts: {
      ...shared,
      metrics: ["total_orders", "delivered_orders", "delayed_orders"],
    },
    rates: {
      ...shared,
      metrics: ["on_time_rate", "avg_delivery_days"],
    },
    monthly: {
      ...shared,
      metrics: ["total_orders"],
      time_grain: "month",
      limit: 100,
    },
    statuses: {
      ...shared,
      metrics: ["total_orders"],
      breakdown: "status",
      order_by: "total_orders",
      order_dir: "desc",
      limit: 100,
    },
  };
}

interface DashboardProps {
  readonly meta: MetaResponse;
  /** The component stays mounted while another workspace is active, preserving scope and data. */
  readonly active?: boolean;
}

function SkeletonCards() {
  return (
    <div className="kpi-grid" aria-label="Loading key metrics">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="kpi-card skeleton-card" key={index} aria-hidden="true">
          <span className="skeleton-line skeleton-label" />
          <span className="skeleton-line skeleton-value" />
          <span className="skeleton-line skeleton-meta" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="chart-skeleton" role="status" aria-label="Loading chart">
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
    </div>
  );
}

export function Dashboard({ meta, active = true }: DashboardProps) {
  const [scope, setScope] = useState<DashboardScope>(DEFAULT_SCOPE);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback((next: DashboardScope, signal: AbortSignal) => {
    const requests = buildRequests(next);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [counts, rates, monthly, statuses] = await Promise.all([
          postQuery(requests.counts, signal),
          postQuery(requests.rates, signal),
          postQuery(requests.monthly, signal),
          postQuery(requests.statuses, signal),
        ]);
        if (signal.aborted) return;
        setData({ counts, rates, monthly, statuses });
        setLoading(false);
      } catch (caught) {
        if (signal.aborted) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "The dashboard could not be loaded. Try again.",
        );
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    load(scope, controller.signal);
    return () => controller.abort();
  }, [active, load, reloadNonce, scope]);

  if (!active) return null;

  const kpiMetrics = data === null ? [] : [...data.counts.summary, ...data.rates.summary];
  const noMatches = data !== null && data.counts.scope_row_count === 0;
  const appliedScope = data === null ? scopeSummary(scope, meta) : describeScope(data.counts.scope);

  return (
    <div className="dashboard-view" id="overview-workspace">
      <FilterBar meta={meta} scope={scope} onChange={setScope} disabled={loading} />

      {error !== null && (
        <div className="state-panel state-panel-error inline-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <div>
            <strong>Overview refresh failed</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setReloadNonce((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="scope-status" role="status" aria-live="polite">
        <span className={`status-dot${loading ? " is-pulsing" : ""}`} aria-hidden="true" />
        <span>
          {loading && data !== null ? "Updating results · " : "Applied scope · "}
          {appliedScope}
          {data !== null && (
            <>
              <span aria-hidden="true"> · </span>
              {data.counts.scope_row_count} record{data.counts.scope_row_count === 1 ? "" : "s"} in response
            </>
          )}
        </span>
      </div>

      {noMatches && (
        <div className="empty-state" role="status">
          <span className="empty-state-mark" aria-hidden="true">0</span>
          <div>
            <strong>No matching records</strong>
            <p>The selected scope is valid, but the dataset has no rows for these filters.</p>
          </div>
        </div>
      )}

      <section className="panel analytics-panel" aria-labelledby="kpi-heading" aria-busy={loading}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">At a glance</p>
            <h2 id="kpi-heading">Key performance indicators</h2>
          </div>
          <span className="section-meta">5 tracked metrics</span>
        </div>
        {data === null ? (
          <SkeletonCards />
        ) : (
          <>
            <KpiGrid metrics={kpiMetrics} metricMeta={meta.metrics} />
            <div className="evidence-stack">
              <EvidencePanel
                result={data.counts}
                tableCaption="Order counts over the selected scope"
                evidenceLabel="Count evidence"
              />
              <EvidencePanel
                result={data.rates}
                tableCaption="Delivery rate and duration over the selected scope"
                evidenceLabel="Delivery metric evidence"
              />
            </div>
          </>
        )}
      </section>

      <div className="chart-row">
        <section className="panel chart-panel" aria-labelledby="monthly-heading" aria-busy={loading}>
          <div className="section-heading section-heading-compact">
            <div>
              <p className="eyebrow">Volume trend</p>
              <h2 id="monthly-heading">Order volume by month</h2>
            </div>
            <span className="chart-legend"><span className="legend-swatch legend-swatch-indigo" />Orders</span>
          </div>
          {data === null ? (
            <ChartSkeleton />
          ) : (
            <>
              <ResultChart result={data.monthly} title="Order volume by month" />
              <EvidencePanel
                result={data.monthly}
                tableCaption="Orders per calendar month in the selected scope"
                evidenceLabel="Monthly chart data"
              />
            </>
          )}
        </section>

        <section className="panel chart-panel" aria-labelledby="status-heading" aria-busy={loading}>
          <div className="section-heading section-heading-compact">
            <div>
              <p className="eyebrow">Order mix</p>
              <h2 id="status-heading">Orders by status</h2>
            </div>
            <span className="chart-legend"><span className="legend-swatch legend-swatch-violet" />Records</span>
          </div>
          {data === null ? (
            <ChartSkeleton />
          ) : (
            <>
              <ResultChart result={data.statuses} title="Orders by status" />
              <p className="panel-note">
                Exception records have an unknown outcome and are counted separately from delayed records; they are not treated as late deliveries.
              </p>
              <EvidencePanel
                result={data.statuses}
                tableCaption="Orders per status in the selected scope"
                evidenceLabel="Status chart data"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export { buildRequests, toFilters };
