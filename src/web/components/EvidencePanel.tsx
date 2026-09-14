import { useId } from "react";
import { DIMENSION_LABELS, TIME_GRAIN_LABELS } from "../../domain/chart.ts";
import { describeScope } from "../../domain/format.ts";
import type { QueryResponse } from "../../shared/contracts.ts";
import { ResultTable } from "./ResultTable.tsx";

interface EvidencePanelProps {
  readonly result: QueryResponse;
  readonly tableCaption: string;
  /** Collapsed by default on the dashboard, open for a question answer. */
  readonly defaultOpen?: boolean;
  readonly evidenceLabel?: string;
}

function describeFilters(result: QueryResponse): string {
  if (result.plan.filters.length === 0) return "No categorical filters";
  return result.plan.filters.map((filter) => `${DIMENSION_LABELS[filter.field]} is ${filter.values.join(", ")}`).join(" · ");
}

/** Shared query evidence surface; it exposes provenance before definitions and rows. */
export function EvidencePanel({
  result,
  tableCaption,
  defaultOpen = false,
  evidenceLabel = "Result evidence",
}: EvidencePanelProps) {
  const instanceId = useId().replaceAll(":", "");
  const summaryId = `evidence-summary-${instanceId}`;
  const warningsId = `evidence-warnings-${instanceId}`;
  const assumptionsId = `evidence-assumptions-${instanceId}`;
  const grouping =
    result.plan.breakdown !== null
      ? `Broken down by ${DIMENSION_LABELS[result.plan.breakdown]}`
      : result.plan.time_grain !== "none"
        ? `Grouped by ${TIME_GRAIN_LABELS[result.plan.time_grain].toLowerCase()}`
        : "Single value over the whole scope";

  return (
    <div className="evidence-panel-container">
      {result.truncated && (
        <p className="truncation-notice" role="status">
          Showing {result.returned_groups} of {result.total_groups} analytical groups returned after server ranking. The source scope contains {result.scope_row_count} records.
        </p>
      )}
      <details className="evidence" open={defaultOpen} aria-labelledby={summaryId}>
        <summary id={summaryId}>
          <span className="evidence-label">{evidenceLabel}</span>
          <span>Data &amp; evidence</span>
          <span className="sr-only">Evidence: filters, definitions and underlying data</span>
        </summary>

        <dl className="evidence-list">
          <dt>Scope</dt>
          <dd>{describeScope(result.scope)}</dd>
          <dt>How the range was chosen</dt>
          <dd>{result.scope.basis}</dd>
          <dt>Metrics</dt>
          <dd>{result.plan.metrics.join(", ")}</dd>
          <dt>Grouping</dt>
          <dd>{grouping}</dd>
          <dt>Filters</dt>
          <dd>{describeFilters(result)}</dd>
          <dt>Source records</dt>
          <dd>{result.scope_row_count} record{result.scope_row_count === 1 ? "" : "s"} in the analytical scope</dd>
          <dt>Returned analytical groups</dt>
          <dd>{result.returned_groups} of {result.total_groups} groups returned by the API</dd>
          <dt>Versions</dt>
          <dd>data {result.data_version}, metric {result.metric_version}</dd>
        </dl>

        {result.warnings.length > 0 && (
          <section aria-labelledby={warningsId}>
            <h4 id={warningsId}>Caveats for this result</h4>
            <ul className="evidence-warnings">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        )}

        {result.assumptions.length > 0 && (
          <section aria-labelledby={assumptionsId}>
            <h4 id={assumptionsId}>Assumptions behind these metrics</h4>
            <ul className="evidence-assumptions">
              {result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
          </section>
        )}

        <ResultTable result={result} caption={tableCaption} />
      </details>
    </div>
  );
}
