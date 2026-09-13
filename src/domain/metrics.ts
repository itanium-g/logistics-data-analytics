/**
 * Metric registry (metric version 2).
 *
 * One definition per metric, used by the dashboard and by the natural-language
 * path alike, so the two can never disagree. Each metric contributes plain SQL
 * aggregate expressions over the already-filtered `orders` scope; the final
 * arithmetic happens here in TypeScript so ratios expose their numerator and
 * denominator, averages expose their eligible count, and an absent denominator
 * produces null with an explanation instead of a misleading zero.
 *
 * The expressions are constants from a trusted map. No caller-supplied text ever
 * reaches them.
 */
import {
  METRIC_IDS,
  type MetricId,
  type MetricMeta,
  type MetricUnit,
  type MetricValue,
} from "../shared/contracts.ts";

export type MetricKind = "count" | "sum" | "ratio" | "average";

type MetricSpec =
  | { readonly kind: "count" | "sum"; readonly value: string }
  | {
      readonly kind: "ratio";
      readonly numerator: string;
      readonly denominator: string;
      readonly emptyNote: string;
    }
  | {
      readonly kind: "average";
      readonly total: string;
      readonly eligible: string;
      readonly emptyNote: string;
    };

export interface MetricDefinition extends MetricMeta {
  readonly spec: MetricSpec;
}

export type { MetricValue };

const STATUS_PROXY_ASSUMPTION =
  "Project assumption: delivered is the on-time proxy and delayed is the late proxy. The source has no promised delivery date or SLA threshold, so this is not an exact SLA measurement.";

const EXCEPTION_EXCLUSION_ASSUMPTION =
  "exception, in_transit and canceled records are excluded from this denominator because their delivery outcome is unknown or absent.";

const DELIVERY_OUTCOME_SQL = "status IN ('delivered', 'delayed')";

function countOf(status: string): string {
  return `SUM(CASE WHEN status = '${status}' THEN 1 ELSE 0 END)`;
}

const REGISTRY: Readonly<Record<MetricId, MetricDefinition>> = {
  total_orders: {
    id: "total_orders",
    label: "Total orders",
    definition: "Count of orders in scope. order_id is unique, enforced at import.",
    unit: "orders",
    kind: "count",
    assumptions: [],
    spec: { kind: "count", value: "COUNT(*)" },
  },
  delivered_orders: {
    id: "delivered_orders",
    label: "Delivered orders",
    definition: "Count of orders whose status is delivered.",
    unit: "orders",
    kind: "count",
    assumptions: [STATUS_PROXY_ASSUMPTION],
    spec: { kind: "count", value: countOf("delivered") },
  },
  delayed_orders: {
    id: "delayed_orders",
    label: "Delayed orders (status proxy)",
    definition:
      "Count of orders whose status is delayed. Exception records are counted separately and are not treated as late.",
    unit: "orders",
    kind: "count",
    assumptions: [STATUS_PROXY_ASSUMPTION],
    spec: { kind: "count", value: countOf("delayed") },
  },
  on_time_rate: {
    id: "on_time_rate",
    label: "On-time delivery rate (status proxy)",
    definition:
      "delivered / (delivered + delayed) within scope, returned as a fraction. Both components are reported.",
    unit: "fraction",
    kind: "ratio",
    assumptions: [STATUS_PROXY_ASSUMPTION, EXCEPTION_EXCLUSION_ASSUMPTION],
    spec: {
      kind: "ratio",
      numerator: countOf("delivered"),
      denominator: `SUM(CASE WHEN ${DELIVERY_OUTCOME_SQL} THEN 1 ELSE 0 END)`,
      emptyNote:
        "No delivered or delayed records in scope, so an on-time rate is undefined rather than zero.",
    },
  },
  avg_delivery_days: {
    id: "avg_delivery_days",
    label: "Average delivery time (delivery-status records)",
    definition:
      "Mean whole calendar days from order_date to delivery_date across dated delivered or delayed records. The eligible record count is reported.",
    unit: "days",
    kind: "average",
    assumptions: [
      STATUS_PROXY_ASSUMPTION,
      "Records without a delivery_date cannot contribute a duration and are excluded from the eligible count.",
    ],
    spec: {
      kind: "average",
      total: `SUM(CASE WHEN ${DELIVERY_OUTCOME_SQL} AND delivery_days IS NOT NULL THEN delivery_days ELSE 0 END)`,
      eligible: `SUM(CASE WHEN ${DELIVERY_OUTCOME_SQL} AND delivery_days IS NOT NULL THEN 1 ELSE 0 END)`,
      emptyNote:
        "No dated delivered or delayed records in scope, so an average delivery time is undefined.",
    },
  },
  delay_rate: {
    id: "delay_rate",
    label: "Delay rate (status proxy)",
    definition:
      "delayed / (delivered + delayed) within scope, returned as a fraction. Both components are reported.",
    unit: "fraction",
    kind: "ratio",
    assumptions: [STATUS_PROXY_ASSUMPTION, EXCEPTION_EXCLUSION_ASSUMPTION],
    spec: {
      kind: "ratio",
      numerator: countOf("delayed"),
      denominator: `SUM(CASE WHEN ${DELIVERY_OUTCOME_SQL} THEN 1 ELSE 0 END)`,
      emptyNote:
        "No delivered or delayed records in scope, so a delay rate is undefined rather than zero.",
    },
  },
  exception_orders: {
    id: "exception_orders",
    label: "Exception orders",
    definition:
      "Count of orders whose status is exception. The outcome of these records is unknown; they are not late deliveries.",
    unit: "orders",
    kind: "count",
    assumptions: [
      "An exception record may carry a delivery_date, which does not establish successful or late delivery.",
    ],
    spec: { kind: "count", value: countOf("exception") },
  },
  in_transit_orders: {
    id: "in_transit_orders",
    label: "In-transit orders",
    definition: "Count of orders whose status is in_transit. These have no delivery outcome yet.",
    unit: "orders",
    kind: "count",
    assumptions: [],
    spec: { kind: "count", value: countOf("in_transit") },
  },
  canceled_orders: {
    id: "canceled_orders",
    label: "Canceled orders",
    definition: "Count of orders whose status is canceled. Their units are excluded from demand.",
    unit: "orders",
    kind: "count",
    assumptions: [],
    spec: { kind: "count", value: countOf("canceled") },
  },
  total_units: {
    id: "total_units",
    label: "Total units",
    definition: "Sum of quantity across every order in scope, including canceled orders.",
    unit: "units",
    kind: "sum",
    assumptions: [],
    spec: { kind: "sum", value: "SUM(quantity)" },
  },
  demand_units: {
    id: "demand_units",
    label: "Demand units (excludes canceled)",
    definition:
      "Sum of quantity excluding canceled orders. This is the quantity series the forecast uses.",
    unit: "units",
    kind: "sum",
    assumptions: [
      "Canceled orders are treated as non-demand. Recorded orders are not a measurement of latent or lost demand.",
    ],
    spec: {
      kind: "sum",
      value: "SUM(CASE WHEN status <> 'canceled' THEN quantity ELSE 0 END)",
    },
  },
  raw_order_value_cents: {
    id: "raw_order_value_cents",
    label: "Raw order value",
    definition:
      "Sum of the supplied order_value_usd in integer cents. Equal to quantity times unit price in this dataset.",
    unit: "cents",
    kind: "sum",
    assumptions: [
      "This is a gross recorded amount, not recognised or net revenue. Promotion discounts are not subtracted.",
    ],
    spec: { kind: "sum", value: "SUM(order_value_cents)" },
  },
  delayed_exception_value_cents: {
    id: "delayed_exception_value_cents",
    label: "Order value on delayed or exception records",
    definition:
      "Sum of raw order value on delayed or exception records, in integer cents.",
    unit: "cents",
    kind: "sum",
    assumptions: [
      "This is associated value exposure, not measured financial loss or an expected cost.",
    ],
    spec: {
      kind: "sum",
      value:
        "SUM(CASE WHEN status IN ('delayed', 'exception') THEN order_value_cents ELSE 0 END)",
    },
  },
};

export function getMetric(id: MetricId): MetricDefinition {
  const definition = REGISTRY[id];
  if (definition === undefined) {
    // Unreachable for a validated MetricId; guards against registry drift.
    throw new Error(`Unknown metric ${id}`);
  }
  return definition;
}

export function listMetrics(): readonly MetricDefinition[] {
  return METRIC_IDS.map(getMetric);
}

export function metricMetaList(): readonly MetricMeta[] {
  return listMetrics().map(({ id, label, definition, unit, kind, assumptions }) => ({
    id,
    label,
    definition,
    unit,
    kind,
    assumptions,
  }));
}

export interface AggregatePart {
  readonly alias: string;
  readonly expression: string;
}

/** SQL aggregate parts a metric needs, with stable aliases. */
export function metricAggregateParts(id: MetricId): readonly AggregatePart[] {
  const { spec } = getMetric(id);
  switch (spec.kind) {
    case "count":
    case "sum":
      return [{ alias: `${id}__value`, expression: spec.value }];
    case "ratio":
      return [
        { alias: `${id}__num`, expression: spec.numerator },
        { alias: `${id}__den`, expression: spec.denominator },
      ];
    case "average":
      return [
        { alias: `${id}__total`, expression: spec.total },
        { alias: `${id}__eligible`, expression: spec.eligible },
      ];
  }
}

function readNumber(row: Readonly<Record<string, unknown>>, alias: string): number {
  const raw = row[alias];
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Turn one aggregated SQL row into a metric value.
 *
 * Empty counts and sums are zero. Ratios and averages with no eligible records
 * return null with a note: averaging an undefined rate or reporting it as 0%
 * would be wrong.
 */
export function computeMetricValue(
  id: MetricId,
  row: Readonly<Record<string, unknown>>,
): MetricValue {
  const definition = getMetric(id);
  const base = { metric: id, label: definition.label, unit: definition.unit } as const;
  const { spec } = definition;

  switch (spec.kind) {
    case "count":
    case "sum":
      return { ...base, value: readNumber(row, `${id}__value`) };
    case "ratio": {
      const numerator = readNumber(row, `${id}__num`);
      const denominator = readNumber(row, `${id}__den`);
      if (denominator === 0) {
        return { ...base, value: null, numerator, denominator, note: spec.emptyNote };
      }
      return { ...base, value: numerator / denominator, numerator, denominator };
    }
    case "average": {
      const total = readNumber(row, `${id}__total`);
      const eligible = readNumber(row, `${id}__eligible`);
      if (eligible === 0) {
        return { ...base, value: null, eligible_count: eligible, note: spec.emptyNote };
      }
      return { ...base, value: total / eligible, eligible_count: eligible };
    }
  }
}
