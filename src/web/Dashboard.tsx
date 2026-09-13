import { useCallback, useEffect, useState } from "react";
import type { QueryRequestInput } from "../domain/query-schema.ts";
import { describeScope } from "../domain/format.ts";
import type {
  Dimension,
  MetaResponse,
  QueryResponse,
} from "../shared/contracts.ts";
import { ApiError, postQuery } from "./api.ts";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { DEFAULT_SCOPE, FilterBar, type DashboardScope } from "./components/FilterBar.tsx";
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
}

export function Dashboard({ meta }: DashboardProps) {
  const [scope, setScope] = useState<DashboardScope>(DEFAULT_SCOPE);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const controller = new AbortController();
    load(scope, controller.signal);
    return () => controller.abort();
  }, [scope, load]);

  const kpiMetrics =
    data === null ? [] : [...data.counts.summary, ...data.rates.summary];

  return (
    <>
      <FilterBar meta={meta} scope={scope} onChange={setScope} disabled={loading} />

      {error !== null && (
        <p className="panel error" role="alert">
          {error}
        </p>
      )}

      {data !== null && (
        <p className="scope-line" role="status">
          {describeScope(data.counts.scope)} · {data.counts.scope_row_count} record
          {data.counts.scope_row_count === 1 ? "" : "s"} in scope
        </p>
      )}

      <section className="panel" aria-labelledby="kpi-heading" aria-busy={loading}>
        <h2 id="kpi-heading">Key performance indicators</h2>
        {data === null ? (
          <p role="status">{loading ? "Loading KPIs…" : "No data available."}</p>
        ) : (
          <>
            <KpiGrid metrics={kpiMetrics} metricMeta={meta.metrics} />
            <EvidencePanel
              result={data.counts}
              tableCaption="Order counts over the selected scope"
            />
            <EvidencePanel
              result={data.rates}
              tableCaption="Delivery rate and duration over the selected scope"
            />
          </>
        )}
      </section>

      <div className="chart-row">
        <section className="panel" aria-labelledby="monthly-heading" aria-busy={loading}>
          <h2 id="monthly-heading">Order volume by month</h2>
          {data === null ? (
            <p role="status">{loading ? "Loading chart…" : "No data available."}</p>
          ) : (
            <>
              <ResultChart result={data.monthly} title="Order volume by month" />
              <EvidencePanel
                result={data.monthly}
                tableCaption="Orders per calendar month in the selected scope"
              />
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="status-heading" aria-busy={loading}>
          <h2 id="status-heading">Orders by status</h2>
          {data === null ? (
            <p role="status">{loading ? "Loading chart…" : "No data available."}</p>
          ) : (
            <>
              <ResultChart result={data.statuses} title="Orders by status" />
              <p className="panel-note">
                Exception records have an unknown outcome and are counted separately from
                delayed records; they are not treated as late deliveries.
              </p>
              <EvidencePanel
                result={data.statuses}
                tableCaption="Orders per status in the selected scope"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
