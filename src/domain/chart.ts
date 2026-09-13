/**
 * Deterministic chart selection.
 *
 * The visualization follows from the shape of the result, not from a model's
 * opinion: a time series becomes a line, a ranked breakdown becomes a horizontal
 * bar, and a single number becomes a card. The table beside the chart always
 * renders the same rows.
 */
import type {
  CanonicalQueryPlan,
  ChartSpec,
  Dimension,
  TimeGrain,
} from "../shared/contracts.ts";
import { getMetric } from "./metrics.ts";

export const DIMENSION_LABELS: Readonly<Record<Dimension, string>> = {
  carrier: "Carrier",
  region: "Region",
  product_category: "Product category",
  warehouse: "Warehouse",
  client_id: "Client",
  destination_city: "Destination city",
  status: "Status",
  sku: "SKU",
};

export const TIME_GRAIN_LABELS: Readonly<Record<TimeGrain, string>> = {
  none: "Whole scope",
  day: "Day",
  week: "Week (Monday start)",
  month: "Month",
};

export function selectChart(plan: CanonicalQueryPlan): ChartSpec {
  const valueMetric = plan.order_by ?? plan.metrics[0];
  if (valueMetric === undefined) {
    throw new Error("A query plan must request at least one metric");
  }
  const metricLabel = getMetric(valueMetric).label;

  if (plan.time_grain !== "none") {
    return {
      hint: "line",
      x_label: TIME_GRAIN_LABELS[plan.time_grain],
      y_label: metricLabel,
      value_metric: valueMetric,
    };
  }

  if (plan.breakdown !== null) {
    return {
      hint: "bar",
      x_label: metricLabel,
      y_label: DIMENSION_LABELS[plan.breakdown],
      value_metric: valueMetric,
    };
  }

  return {
    hint: "scalar",
    x_label: "Whole scope",
    y_label: metricLabel,
    value_metric: valueMetric,
  };
}
