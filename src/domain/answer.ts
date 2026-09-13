/**
 * Deterministic answer text.
 *
 * Every number in an answer comes from a computed result field and is formatted
 * by the same functions the dashboard uses. No sentence here is produced by a
 * model, and no value is recomputed: this module only selects and phrases.
 */
import { DIMENSION_LABELS, TIME_GRAIN_LABELS } from "./chart.ts";
import {
  describeMetricBasis,
  describeScope,
  formatGroupLabel,
  formatMetricValue,
  formatMonthKey,
} from "./format.ts";
import type {
  CanonicalQueryPlan,
  ForecastResponse,
  MetricValue,
  QueryResponse,
} from "../shared/contracts.ts";

function primaryMetric(result: QueryResponse): MetricValue | undefined {
  const target = result.chart.value_metric;
  return result.summary.find((metric) => metric.metric === target);
}

/** Plain description of the plan that ran, for the interpretation panel. */
export function describePlan(plan: CanonicalQueryPlan): string {
  const parts: string[] = [`Metrics ${plan.metrics.join(", ")}`];
  if (plan.breakdown !== null) parts.push(`broken down by ${DIMENSION_LABELS[plan.breakdown]}`);
  if (plan.time_grain !== "none") {
    parts.push(`grouped by ${TIME_GRAIN_LABELS[plan.time_grain].toLowerCase()}`);
  }
  parts.push(plan.date_field === "order_date" ? "on order date" : "on delivery date");
  if (plan.filters.length > 0) {
    parts.push(
      `filtered where ${plan.filters
        .map(
          (filter) =>
            `${DIMENSION_LABELS[filter.field]} ${filter.op === "eq" ? "is" : "is one of"} ${filter.values.join(", ")}`,
        )
        .join(" and ")}`,
    );
  }
  if (plan.order_by !== null) {
    parts.push(`ranked by ${plan.order_by} ${plan.order_dir === "desc" ? "descending" : "ascending"}`);
  }
  return `${parts.join(", ")}.`;
}

export function renderQueryAnswer(result: QueryResponse): string {
  const scope = describeScope(result.scope);
  const metric = primaryMetric(result);

  if (result.scope_row_count === 0) {
    return `No records match ${scope}. Counts are zero and rates are undefined rather than zero.`;
  }

  if (result.chart.hint === "scalar") {
    const values = result.summary
      .map((entry) => {
        const basis = describeMetricBasis(entry);
        return `${entry.label} is ${formatMetricValue(entry)}${basis === "" ? "" : ` (${basis})`}`;
      })
      .join("; ");
    return `${values}. Scope: ${scope}, ${result.scope_row_count} records.`;
  }

  if (result.chart.hint === "line") {
    const total = result.rows.reduce(
      (sum, row) =>
        sum + (row.metrics.find((entry) => entry.metric === result.chart.value_metric)?.value ?? 0),
      0,
    );
    const isRate = metric?.unit === "fraction" || metric?.unit === "days";
    const peak = [...result.rows].sort((left, right) => {
      const leftValue =
        left.metrics.find((entry) => entry.metric === result.chart.value_metric)?.value ?? -1;
      const rightValue =
        right.metrics.find((entry) => entry.metric === result.chart.value_metric)?.value ?? -1;
      return rightValue - leftValue;
    })[0];
    const peakMetric = peak?.metrics.find((entry) => entry.metric === result.chart.value_metric);

    const totalSentence = isRate
      ? `${metric?.label ?? result.chart.y_label} over the whole scope is ${metric === undefined ? "N/A" : formatMetricValue(metric)}`
      : `${metric?.label ?? result.chart.y_label} totals ${metric === undefined ? "N/A" : formatMetricValue(metric)} over the whole scope`;

    const peakSentence =
      peak === undefined || peakMetric === undefined
        ? ""
        : ` The highest ${TIME_GRAIN_LABELS[result.plan.time_grain].toLowerCase()} was ${formatGroupLabel(peak.key, result.plan.time_grain)} at ${formatMetricValue(peakMetric)}.`;

    const sumNote =
      isRate || metric === undefined
        ? ""
        : ` The ${result.rows.length} buckets shown sum to ${Math.round(total * 100) / 100}.`;

    return `${totalSentence}, split across ${result.rows.length} ${TIME_GRAIN_LABELS[result.plan.time_grain].toLowerCase()} buckets. Scope: ${scope}.${peakSentence}${sumNote}`;
  }

  // Ranked breakdown.
  const dimension = result.plan.breakdown === null ? "group" : DIMENSION_LABELS[result.plan.breakdown];
  const top = result.rows[0];
  const topMetric = top?.metrics.find((entry) => entry.metric === result.chart.value_metric);
  if (top === undefined || topMetric === undefined) {
    return `No ${dimension.toLowerCase()} groups match ${scope}.`;
  }
  const basis = describeMetricBasis(topMetric);
  const truncation = result.truncated
    ? ` ${result.total_groups} groups matched in total and the top ${result.returned_groups} are shown, ranked over the full scope.`
    : ` ${result.total_groups} ${dimension.toLowerCase()} group${result.total_groups === 1 ? "" : "s"} were ranked.`;

  return (
    `${top.label} leads on ${topMetric.label} at ${formatMetricValue(topMetric)}` +
    `${basis === "" ? "" : ` (${basis})`}, from ${top.row_count} record${top.row_count === 1 ? "" : "s"} in that group. ` +
    `Scope: ${scope}, ${result.scope_row_count} records.${truncation}`
  );
}

export function renderForecastAnswer(result: ForecastResponse): string {
  const first = result.forecast[0]?.month;
  const last = result.forecast[result.forecast.length - 1]?.month;
  const horizonLabel =
    first === undefined || last === undefined
      ? "the requested horizon"
      : first === last
        ? formatMonthKey(first)
        : `${formatMonthKey(first)} to ${formatMonthKey(last)}`;

  const perMonth = Math.round(result.monthly_forecast_units * 10_000) / 10_000;
  const base = Math.round(result.base_demand_units * 10_000) / 10_000;

  return (
    `${result.sku} recorded ${result.sample.total_units} unit${result.sample.total_units === 1 ? "" : "s"} across ` +
    `${result.sample.non_zero_months} of ${result.history.length} months, so the ${result.method.label.toLowerCase()} ` +
    `gives ${perMonth} units per month for ${horizonLabel}, or ${base} units in total. ` +
    `With a ${result.buffer_pct}% buffer the demand coverage target is ${result.coverage_target_units} unit${result.coverage_target_units === 1 ? "" : "s"}. ` +
    `This is as of ${result.as_of_date} and is not a net purchase quantity: stock on hand, inbound supply and lead times are absent from the dataset.`
  );
}
