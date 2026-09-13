import {
  describeMetricBasis,
  formatGroupLabel,
  formatMetricValue,
} from "../../domain/format.ts";
import { DIMENSION_LABELS } from "../../domain/chart.ts";
import type { QueryResponse } from "../../shared/contracts.ts";

interface ResultTableProps {
  readonly result: QueryResponse;
  readonly caption: string;
}

function keyHeading(result: QueryResponse): string {
  if (result.plan.breakdown !== null) return DIMENSION_LABELS[result.plan.breakdown];
  if (result.plan.time_grain !== "none") return result.chart.x_label;
  return "Scope";
}

/**
 * The underlying rows behind every chart and card. This is the same array the
 * chart plots, so the two cannot disagree, and it keeps the data reachable
 * without relying on the visualization.
 */
export function ResultTable({ result, caption }: ResultTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{keyHeading(result)}</th>
            <th scope="col">Records</th>
            {result.plan.metrics.map((metric) => {
              const label = result.rows[0]?.metrics.find((entry) => entry.metric === metric)?.label;
              return (
                <th key={metric} scope="col">
                  {label ?? metric}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 && (
            <tr>
              <td colSpan={result.plan.metrics.length + 2}>No records match this scope.</td>
            </tr>
          )}
          {result.rows.map((row) => (
            <tr key={row.key ?? "scope"}>
              <th scope="row">{formatGroupLabel(row.key, result.plan.time_grain)}</th>
              <td className="numeric">{row.row_count}</td>
              {result.plan.metrics.map((metricId) => {
                const metric = row.metrics.find((entry) => entry.metric === metricId);
                return (
                  <td className="numeric" key={metricId}>
                    {metric === undefined ? "N/A" : formatMetricValue(metric)}
                    {metric !== undefined && describeMetricBasis(metric) !== "" && (
                      <span className="cell-basis">{describeMetricBasis(metric)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {result.rows.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">Whole scope</th>
              <td className="numeric">{result.scope_row_count}</td>
              {result.plan.metrics.map((metricId) => {
                const metric = result.summary.find((entry) => entry.metric === metricId);
                return (
                  <td className="numeric" key={metricId}>
                    {metric === undefined ? "N/A" : formatMetricValue(metric)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
