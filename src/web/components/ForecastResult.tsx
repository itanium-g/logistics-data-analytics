import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIsoDate, formatMonthKey } from "../../domain/format.ts";
import type { ForecastResponse } from "../../shared/contracts.ts";
import { useReducedMotion } from "../theme.tsx";

/** Forecast units can be fractional, so show up to two decimals. */
export function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

interface ChartPoint {
  readonly label: string;
  readonly history: number | null;
  readonly forecast: number | null;
}

function buildPoints(result: ForecastResponse): readonly ChartPoint[] {
  return [
    ...result.history.map((point) => ({
      label: formatMonthKey(point.month),
      history: point.units,
      forecast: null,
    })),
    ...result.forecast.map((point) => ({
      label: formatMonthKey(point.month),
      history: null,
      forecast: point.units,
    })),
  ];
}

interface ForecastResultProps {
  readonly result: ForecastResponse;
}

/** Forecast values, historical boundary, target, and methodology in one checkable result. */
export function ForecastResult({ result }: ForecastResultProps) {
  const instanceId = useId().replaceAll(":", "");
  const detailsId = `forecast-evidence-${instanceId}`;
  const caveatsId = `forecast-caveats-${instanceId}`;
  const assumptionsId = `forecast-assumptions-${instanceId}`;
  const limitationsId = `forecast-limitations-${instanceId}`;
  const points = buildPoints(result);
  const boundaryLabel =
    result.history.length === 0
      ? null
      : formatMonthKey(result.history[result.history.length - 1]?.month ?? "");
  const reducedMotion = useReducedMotion();

  return (
    <div className="forecast-result">
      <div className="forecast-result-heading">
        <div>
          <p className="eyebrow">Planning signal</p>
          <h3>Coverage target</h3>
        </div>
        <span className="result-status">{result.coverage_status}</span>
      </div>

      <p className="forecast-target" role="status">
        <span className="forecast-target-value">{result.coverage_target_units}</span>
        <span className="forecast-target-label">
          units of demand coverage to plan for <strong>{result.sku}</strong>
        </span>
      </p>
      <p className="forecast-recommendation">{result.recommendation}</p>

      {result.limitations[0] !== undefined && (
        <p className="forecast-limit-note">
          <strong>Read this as a coverage target.</strong> {result.limitations[0]}
        </p>
      )}

      <dl className="forecast-numbers">
        <div>
          <dt>Baseline per month</dt>
          <dd>{formatUnits(result.monthly_forecast_units)} units</dd>
        </div>
        <div>
          <dt>Baseline over {result.horizon_months} months</dt>
          <dd>{formatUnits(result.base_demand_units)} units</dd>
        </div>
        <div>
          <dt>Buffer at {result.buffer_pct}%</dt>
          <dd>{formatUnits(result.buffer_units)} units</dd>
        </div>
        <div>
          <dt>Rounded target</dt>
          <dd>{result.coverage_target_units} units</dd>
        </div>
        <div>
          <dt>As of</dt>
          <dd>{formatIsoDate(result.as_of_date)} · {result.coverage_status}</dd>
        </div>
        <div>
          <dt>Sample</dt>
          <dd>
            {result.sample.order_rows} rows · {result.sample.total_units} units · demand in {result.sample.non_zero_months} of {result.history.length} months
          </dd>
        </div>
      </dl>

      <div className="forecast-chart-header">
        <div>
          <p className="eyebrow">Monthly demand</p>
          <h4>Recorded history and forecast</h4>
        </div>
        <div className="forecast-legend" aria-label="Chart legend">
          <span><i className="legend-swatch legend-swatch-indigo" />Recorded</span>
          <span><i className="legend-swatch legend-swatch-forecast" />Forecast</span>
        </div>
      </div>
      <div
        className="chart-frame forecast-chart"
        role="img"
        aria-label={`Recorded monthly units for ${result.sku} from ${formatMonthKey(result.history[0]?.month ?? "") } to ${boundaryLabel ?? ""}, then ${result.forecast.length} forecast months shown as a dashed line. The same values are listed in the table below.`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={[...points]} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke="var(--chart-axis)"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              interval="preserveStartEnd"
            />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11, fill: "var(--chart-axis)" }} allowDecimals />
            <Tooltip
              contentStyle={{
                background: "var(--chart-tooltip-bg)",
                border: "1px solid var(--chart-tooltip-border)",
                borderRadius: "8px",
                color: "var(--chart-tooltip-text)",
                boxShadow: "var(--shadow-popover)",
              }}
              formatter={(value: unknown) =>
                typeof value === "number" ? `${formatUnits(value)} units` : "—"
              }
            />
            {boundaryLabel !== null && (
              <ReferenceLine
                x={boundaryLabel}
                stroke="var(--chart-axis)"
                strokeDasharray="4 4"
                label={{
                  value: "history ends",
                  position: "insideTopRight",
                  fill: "var(--chart-axis)",
                  fontSize: 10,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="history"
              name="Recorded units"
              stroke="var(--chart-series)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--chart-series)", stroke: "var(--chart-series)" }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Forecast units"
              stroke="var(--chart-forecast)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: "var(--chart-forecast)", stroke: "var(--chart-forecast)" }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="table-scroll">
        <table className="data-table forecast-table">
          <caption>
            Recorded and forecast monthly units for {result.sku}. Forecast months show the baseline before rounding.
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Basis</th>
              <th scope="col">Units</th>
            </tr>
          </thead>
          <tbody>
            {[...result.history, ...result.forecast].map((point) => (
              <tr className={point.kind === "forecast" ? "forecast-row" : "history-row"} key={`${point.kind}-${point.month}`}>
                <th scope="row">{formatMonthKey(point.month)}</th>
                <td>{point.kind === "history" ? "Recorded" : "Forecast"}</td>
                <td className="numeric">{formatUnits(point.units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="evidence forecast-evidence" aria-labelledby={detailsId}>
        <summary id={detailsId}>Method, assumptions and limitations</summary>
        <dl className="evidence-list">
          <dt>Method</dt>
          <dd>{result.method.label}</dd>
          <dt>Why this method</dt>
          <dd>{result.method.description}</dd>
          <dt>History window</dt>
          <dd>{formatIsoDate(result.history_range.start)} to {formatIsoDate(result.history_range.end)}</dd>
          <dt>Versions</dt>
          <dd>data {result.data_version}, metric {result.metric_version}</dd>
        </dl>

        <h4 id={caveatsId}>Caveats for this forecast</h4>
        <ul className="evidence-warnings" aria-labelledby={caveatsId}>
          {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>

        <h4 id={assumptionsId}>Assumptions</h4>
        <ul className="evidence-assumptions" aria-labelledby={assumptionsId}>
          {result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>

        <h4 id={limitationsId}>What this number is not</h4>
        <ul className="evidence-assumptions" aria-labelledby={limitationsId}>
          {result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </details>
    </div>
  );
}
