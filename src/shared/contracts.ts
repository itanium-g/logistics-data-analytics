/**
 * Canonical API contract vocabulary.
 *
 * Everything the natural-language path may select is enumerated here. The model
 * never supplies an identifier, expression or SQL fragment: it selects from
 * these closed sets, and the server resolves them through trusted maps.
 */

export const METRIC_IDS = [
  "total_orders",
  "delivered_orders",
  "delayed_orders",
  "on_time_rate",
  "avg_delivery_days",
  "delay_rate",
  "exception_orders",
  "in_transit_orders",
  "canceled_orders",
  "total_units",
  "demand_units",
  "raw_order_value_cents",
  "delayed_exception_value_cents",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

/** The five KPIs the brief requires, in display order. */
export const REQUIRED_KPI_METRICS = [
  "total_orders",
  "delivered_orders",
  "delayed_orders",
  "on_time_rate",
  "avg_delivery_days",
] as const satisfies readonly MetricId[];

export const DIMENSIONS = [
  "carrier",
  "region",
  "product_category",
  "warehouse",
  "client_id",
  "destination_city",
  "status",
  "sku",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const TIME_GRAINS = ["none", "day", "week", "month"] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number];

export const DATE_FIELDS = ["order_date", "delivery_date"] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const DATE_CONTEXTS = ["dataset", "current"] as const;
export type DateContext = (typeof DATE_CONTEXTS)[number];

/**
 * Bounded relative ranges. Each resolves to whole complete calendar months
 * before the reference date, so a partial current month never silently
 * distorts a comparison.
 */
export const RELATIVE_RANGES = [
  "all_time",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
] as const;

export type RelativeRange = (typeof RELATIVE_RANGES)[number];

export const FILTER_OPERATORS = ["eq", "in"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const MAX_FILTERS = 5;
export const MAX_FILTER_VALUES = 20;
export const MAX_METRICS_PER_QUERY = 3;
export const MAX_ROW_LIMIT = 100;
export const DEFAULT_ROW_LIMIT = 20;

/** Units are explicit so the browser never guesses a format. */
export const METRIC_UNITS = ["orders", "fraction", "days", "units", "cents"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

export type ChartHint = "line" | "bar" | "scalar";

export interface MetricMeta {
  readonly id: MetricId;
  readonly label: string;
  readonly definition: string;
  readonly unit: MetricUnit;
  readonly kind: "count" | "sum" | "ratio" | "average";
  readonly assumptions: readonly string[];
}

/**
 * One computed metric. Ratios always carry their numerator and denominator and
 * averages carry their eligible count, so a small or absent denominator is
 * visible rather than hidden behind a percentage.
 */
export interface MetricValue {
  readonly metric: MetricId;
  readonly label: string;
  readonly unit: MetricUnit;
  /** Null when undefined in scope. Never null for a count or sum. */
  readonly value: number | null;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly eligible_count?: number;
  /** Present when value is null, explaining why. */
  readonly note?: string;
}

export interface QueryFilterInput {
  readonly field: Dimension;
  readonly op: FilterOperator;
  readonly values: readonly string[];
}

/** The fully resolved plan, echoed back so the caller sees what actually ran. */
export interface CanonicalQueryPlan {
  readonly metrics: readonly MetricId[];
  readonly breakdown: Dimension | null;
  readonly time_grain: TimeGrain;
  readonly date_field: DateField;
  readonly date_context: DateContext;
  readonly relative_range: RelativeRange | null;
  readonly date_from: string | null;
  readonly date_to: string | null;
  readonly filters: readonly QueryFilterInput[];
  readonly order_by: MetricId | null;
  readonly order_dir: "asc" | "desc";
  readonly limit: number;
}

export interface ResolvedScope {
  readonly date_field: DateField;
  readonly date_context: DateContext;
  readonly reference_date: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly relative_range: RelativeRange | null;
  readonly basis: string;
}

export interface QueryRow {
  /** Raw group key: a dimension value, a time bucket, or null for a scalar. */
  readonly key: string | null;
  /** Display label for the key. */
  readonly label: string;
  /** Rows in scope for this group, so small denominators stay visible. */
  readonly row_count: number;
  readonly metrics: readonly MetricValue[];
}

export interface ChartSpec {
  readonly hint: ChartHint;
  readonly x_label: string;
  readonly y_label: string;
  /** Metric rendered by the chart. Tables still show every requested metric. */
  readonly value_metric: MetricId;
}

export interface QueryResponse {
  readonly plan: CanonicalQueryPlan;
  readonly scope: ResolvedScope;
  readonly rows: readonly QueryRow[];
  /** Metrics over the whole filtered scope, independent of grouping. */
  readonly summary: readonly MetricValue[];
  readonly scope_row_count: number;
  readonly total_groups: number;
  readonly returned_groups: number;
  readonly truncated: boolean;
  readonly chart: ChartSpec;
  readonly units: Readonly<Partial<Record<MetricId, MetricUnit>>>;
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
  readonly data_version: string;
  readonly metric_version: string;
}

/* ----------------------------------------------------------------------- ask */

/** The only operations a model may select. */
export const ASK_TOOLS = ["query_metric", "forecast", "clarify", "unsupported"] as const;

export type AskTool = (typeof ASK_TOOLS)[number];

export const MAX_QUESTION_CHARS = 1000;

export interface AskInterpretation {
  readonly tool: AskTool;
  /**
   * Plain description of the validated plan that was executed. This is derived
   * from the canonical plan, never from model reasoning text.
   */
  readonly summary: string;
}

export interface AskResponse {
  readonly question: string;
  readonly tool: AskTool;
  /** Prose rendered from computed result fields only. */
  readonly answer: string;
  readonly interpretation: AskInterpretation;
  readonly query: QueryResponse | null;
  readonly forecast: ForecastResponse | null;
  readonly clarification: {
    readonly question: string;
    readonly missing: string;
  } | null;
  readonly unsupported: {
    readonly reason: string;
    readonly alternative: string;
  } | null;
  readonly provider: { readonly name: string; readonly model: string };
  readonly usage: {
    readonly input_tokens_estimated: number;
    readonly max_output_tokens: number;
  };
  readonly data_version: string;
  readonly metric_version: string;
}

export const FORECAST_METHODS = [
  "sparse_12_month_mean",
  "trailing_3_month_mean",
] as const;

export type ForecastMethodId = (typeof FORECAST_METHODS)[number];

export const MAX_HORIZON_MONTHS = 4;
export const DEFAULT_HORIZON_MONTHS = 4;
export const MAX_BUFFER_PCT = 50;
export const DEFAULT_BUFFER_PCT = 20;

export interface ForecastPoint {
  /** "YYYY-MM" bucket. */
  readonly month: string;
  /** Recorded units for history; the unrounded baseline for forecast months. */
  readonly units: number;
  readonly kind: "history" | "forecast";
}

export interface ForecastMethod {
  readonly id: ForecastMethodId;
  readonly label: string;
  readonly description: string;
}

export interface ForecastResponse {
  readonly scope: "sku";
  readonly sku: string;
  readonly horizon_months: number;
  readonly buffer_pct: number;
  readonly method: ForecastMethod;
  readonly units: "units";
  /** Last day of assumed historical coverage. Forecasts start after this date. */
  readonly as_of_date: string;
  readonly history_range: { readonly start: string; readonly end: string };
  /** Always coverage_unverified: completeness is an assumption, not a fact. */
  readonly coverage_status: string;
  readonly history: readonly ForecastPoint[];
  readonly forecast: readonly ForecastPoint[];
  readonly sample: {
    readonly order_rows: number;
    readonly non_zero_months: number;
    readonly total_units: number;
  };
  /** Unrounded per-month baseline. */
  readonly monthly_forecast_units: number;
  /** Unrounded sum across the horizon. */
  readonly base_demand_units: number;
  readonly buffer_units: number;
  /** The single rounded planning number, rounded once after summing. */
  readonly coverage_target_units: number;
  readonly recommendation: string;
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
  readonly data_version: string;
  readonly metric_version: string;
}

export interface MetaResponse {
  readonly data_version: string;
  readonly metric_version: string;
  readonly imported_at: string;
  readonly source: {
    readonly file: string;
    readonly sha256: string;
    readonly checksum_matches_supplied_fixture: boolean;
  };
  readonly metrics: readonly MetricMeta[];
  readonly required_kpi_metrics: readonly MetricId[];
  readonly dimensions: readonly Dimension[];
  readonly time_grains: readonly TimeGrain[];
  readonly date_fields: readonly DateField[];
  readonly date_contexts: readonly DateContext[];
  readonly relative_ranges: readonly RelativeRange[];
  readonly limits: {
    readonly max_metrics: number;
    readonly max_filters: number;
    readonly max_filter_values: number;
    readonly max_row_limit: number;
    readonly default_row_limit: number;
  };
  readonly observed: {
    readonly row_count: number;
    readonly order_date_min: string;
    readonly order_date_max: string;
    readonly delivery_date_max: string | null;
  };
  readonly assumed_coverage: {
    readonly start: string;
    readonly end: string;
    readonly status: string;
    readonly basis: string;
  };
  readonly dataset_reference_date: string;
  readonly vocabulary: {
    readonly carriers: readonly string[];
    readonly regions: readonly string[];
    readonly product_categories: readonly string[];
    readonly warehouses: readonly string[];
    readonly clients: readonly string[];
    readonly statuses: readonly string[];
    /** Full SKU list so the forecast form can offer a selector. */
    readonly skus: readonly string[];
    readonly sku_count: number;
  };
  readonly assumptions: readonly string[];
}
