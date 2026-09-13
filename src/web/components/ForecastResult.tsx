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

const AXIS_COLOR = "#a7aec0";
const GRID_COLOR = "#333846";
const HISTORY_COLOR = "#5aa9ff";
const FORECAST_COLOR = "#ffcf70";

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

/**
 * Forecast values, the history and future visualization, the numerical inventory
 * target and the methodology. Shared by the forecast form and by an answer that
 * routed to the forecast tool, so both present identical evidence.
 */
export function ForecastResult({ result }: ForecastResultProps) {
  const points = buildPoints(result);
  const boundaryLabel =
    result.history.length === 0
      ? null
      : formatMonthKey(result.history[result.history.length - 1]?.month ?? "");

  return (
    <>
      <p className="forecast-target" role="status">
        <span className="forecast-target-value">{result.coverage_target_units}</span>
        <span className="forecast-target-label">
          units of demand coverage to plan for {result.sku}
        </span>
      </p>
      <p className="forecast-recommendation">{result.recommendation}</p>

      <dl className="forecast-numbers">
        <dt>Baseline per month</dt>
        <dd>{formatUnits(result.monthly_forecast_units)} units</dd>
        <dt>Baseline over {result.horizon_months} months</dt>
        <dd>{formatUnits(result.base_demand_units)} units</dd>
        <dt>Buffer at {result.buffer_pct}%</dt>
        <dd>{formatUnits(result.buffer_units)} units</dd>
        <dt>Coverage target, rounded up once</dt>
        <dd>{result.coverage_target_units} units</dd>
        <dt>As of</dt>
        <dd>
          {formatIsoDate(result.as_of_date)} ({result.coverage_status})
        </dd>
        <dt>Sample</dt>
        <dd>
          {result.sample.order_rows} order rows, {result.sample.total_units} units, demand in{" "}
          {result.sample.non_zero_months} of {result.history.length} months
        </dd>
      </dl>

      <div
        className="chart-frame"
        role="img"
        aria-label={`Recorded monthly units for ${result.sku} from ${formatMonthKey(result.history[0]?.month ?? "")} to ${boundaryLabel ?? ""}, then ${result.forecast.length} forecast months shown as a dashed line. The same values are listed in the table below.`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={[...points]} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke={AXIS_COLOR}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} allowDecimals />
            <Tooltip
              contentStyle={{
                background: "#21252f",
                border: `1px solid ${GRID_COLOR}`,
                borderRadius: "6px",
                color: "#eef0f5",
              }}
              formatter={(value: unknown) =>
                typeof value === "number" ? `${formatUnits(value)} units` : "—"
              }
            />
            {boundaryLabel !== null && (
              <ReferenceLine
                x={boundaryLabel}
                stroke={AXIS_COLOR}
                strokeDasharray="4 4"
                label={{
                  value: "history ends",
                  position: "insideTopRight",
                  fill: AXIS_COLOR,
                  fontSize: 10,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="history"
              name="Recorded units"
              stroke={HISTORY_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Forecast units"
              stroke={FORECAST_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <caption>
            Recorded and forecast monthly units for {result.sku}. Forecast months show the baseline
            before rounding.
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
              <tr key={`${point.kind}-${point.month}`}>
                <th scope="row">{formatMonthKey(point.month)}</th>
                <td>{point.kind === "history" ? "Recorded" : "Forecast"}</td>
                <td className="numeric">{formatUnits(point.units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="evidence" open>
        <summary>Method, assumptions and limitations</summary>
        <dl className="evidence-list">
          <dt>Method</dt>
          <dd>{result.method.label}</dd>
          <dt>Why this method</dt>
          <dd>{result.method.description}</dd>
          <dt>History window</dt>
          <dd>
            {formatIsoDate(result.history_range.start)} to{" "}
            {formatIsoDate(result.history_range.end)}
          </dd>
          <dt>Versions</dt>
          <dd>
            data {result.data_version}, metric {result.metric_version}
          </dd>
        </dl>

        <h4>Caveats for this forecast</h4>
        <ul className="evidence-warnings">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>

        <h4>Assumptions</h4>
        <ul className="evidence-assumptions">
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>

        <h4>What this number is not</h4>
        <ul className="evidence-assumptions">
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
