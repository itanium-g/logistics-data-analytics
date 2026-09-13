import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisSuffix,
  chartValue,
  formatGroupLabel,
  formatMetricValue,
} from "../../domain/format.ts";
import type { QueryResponse } from "../../shared/contracts.ts";

const AXIS_COLOR = "#a7aec0";
const GRID_COLOR = "#333846";
const SERIES_COLOR = "#5aa9ff";

interface ResultChartProps {
  readonly result: QueryResponse;
  /** Accessible description of what the chart shows. */
  readonly title: string;
}

interface Point {
  readonly label: string;
  readonly value: number | null;
  readonly display: string;
}

function buildPoints(result: QueryResponse): readonly Point[] {
  const target = result.chart.value_metric;
  return result.rows.map((row) => {
    const metric = row.metrics.find((entry) => entry.metric === target);
    return {
      label: formatGroupLabel(row.key, result.plan.time_grain),
      value: metric === undefined ? null : chartValue(metric),
      display: metric === undefined ? "N/A" : formatMetricValue(metric),
    };
  });
}

/**
 * The chart type is chosen by the server from the result shape, not here, so the
 * dashboard and the natural-language answer render the same shape identically.
 * A table always accompanies the chart, so the data is reachable without relying
 * on the visualization.
 */
export function ResultChart({ result, title }: ResultChartProps) {
  const points = buildPoints(result);
  const unit = result.units[result.chart.value_metric] ?? "orders";
  const suffix = axisSuffix(unit);

  if (result.chart.hint === "scalar") {
    const first = points[0];
    return (
      <p className="chart-scalar" role="img" aria-label={`${title}: ${first?.display ?? "N/A"}`}>
        <span className="chart-scalar-value">{first?.display ?? "N/A"}</span>
        <span className="chart-scalar-label">{result.chart.y_label}</span>
      </p>
    );
  }

  if (points.length === 0) {
    return (
      <p className="chart-empty" role="status">
        No records match this scope, so there is nothing to plot.
      </p>
    );
  }

  const tooltipStyle = {
    background: "#21252f",
    border: `1px solid ${GRID_COLOR}`,
    borderRadius: "6px",
    color: "#eef0f5",
  };

  // Recharts types the tooltip value loosely, so narrow it here.
  const formatTooltip = (value: unknown): string =>
    typeof value === "number" ? `${value}${suffix}` : "N/A";

  return (
    <div
      className="chart-frame"
      role="img"
      aria-label={`${title}. ${result.chart.hint === "line" ? "Line" : "Bar"} chart of ${result.chart.y_label} by ${result.chart.x_label}. The same values are listed in the table below.`}
    >
      <ResponsiveContainer width="100%" height={260}>
        {result.chart.hint === "line" ? (
          <LineChart data={[...points]} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              stroke={AXIS_COLOR}
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) => `${value}${suffix}`}
              allowDecimals={unit !== "orders" && unit !== "units"}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTooltip}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={result.chart.y_label}
              stroke={SERIES_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        ) : (
          <BarChart
            data={[...points]}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
          >
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              stroke={AXIS_COLOR}
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) => `${value}${suffix}`}
              allowDecimals={unit !== "orders" && unit !== "units"}
            />
            <YAxis
              type="category"
              dataKey="label"
              stroke={AXIS_COLOR}
              tick={{ fontSize: 11 }}
              width={130}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTooltip}
            />
            <Bar dataKey="value" name={result.chart.y_label} fill={SERIES_COLOR} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
