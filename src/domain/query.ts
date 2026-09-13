/**
 * Bounded query compiler and executor.
 *
 * Safety model: every SQL identifier and expression comes from a constant map in
 * this file, and every caller-supplied value is bound as a parameter. There is
 * no string path by which a metric name, dimension, date or filter value can
 * reach the statement text. A caller cannot express a join, subquery, second
 * statement or raw expression, because the request shape has nowhere to put one.
 *
 * Correctness model: filters apply first, then aggregation over the full scope,
 * then ranking, then the limit. Ranking and truncation happen in TypeScript
 * because the group count is small (at most a few hundred), which makes
 * total_groups exact, keeps ties stable, and puts undefined rates last instead of
 * relying on engine-specific NULL ordering.
 */
import type {
  CanonicalQueryPlan,
  DateField,
  Dimension,
  MetricId,
  MetricUnit,
  MetricValue,
  QueryFilterInput,
  QueryResponse,
  QueryRow,
  ResolvedScope,
  TimeGrain,
} from "../shared/contracts.ts";
import { DIMENSION_LABELS, selectChart } from "./chart.ts";
import { DateScopeError, dateScopeWarnings, resolveDateScope } from "./date-context.ts";
import type { SqlDb } from "../shared/db.ts";
import { filterVocabulary, type StoredManifest } from "../data/manifest.ts";
import { computeMetricValue, getMetric, metricAggregateParts } from "./metrics.ts";
import type { QueryRequest } from "./query-schema.ts";

/** Trusted column map. The only bridge from a contract name to SQL text. */
const DIMENSION_COLUMNS: Readonly<Record<Dimension, string>> = {
  carrier: "carrier",
  region: "region",
  product_category: "product_category",
  warehouse: "warehouse",
  client_id: "client_id",
  destination_city: "destination_city",
  status: "status",
  sku: "sku",
};

const DATE_FIELD_COLUMNS: Readonly<Record<DateField, string>> = {
  order_date: "order_date",
  delivery_date: "delivery_date",
};

export type QueryErrorCode = "bad_input" | "unknown_value" | "unsupported";

export class QueryError extends Error {
  readonly code: QueryErrorCode;
  readonly field: string | undefined;

  constructor(code: QueryErrorCode, message: string, field?: string) {
    super(message);
    this.name = "QueryError";
    this.code = code;
    this.field = field;
  }
}

export interface QueryContext {
  readonly db: SqlDb;
  readonly manifest: StoredManifest;
  readonly now: Date;
}

interface CompiledScope {
  readonly where: string;
  readonly params: readonly unknown[];
}

/** Time bucket expressions. Constants; the date field itself comes from a map. */
function timeBucketExpression(grain: Exclude<TimeGrain, "none">, column: string): string {
  switch (grain) {
    case "day":
      return column;
    case "week":
      // Monday that starts the week: step back six days, then to the next Monday.
      return `date(${column}, '-6 days', 'weekday 1')`;
    case "month":
      return `substr(${column}, 1, 7)`;
  }
}

function assertSupportedCombination(request: QueryRequest): void {
  const breakdown = request.breakdown ?? null;
  const orderBy = request.order_by ?? null;

  if (request.time_grain !== "none" && breakdown !== null) {
    throw new QueryError(
      "unsupported",
      `A trend over ${request.time_grain}s and a breakdown by ${DIMENSION_LABELS[breakdown]} cannot be combined in one result. Ask for either the trend or the breakdown.`,
      "time_grain",
    );
  }

  if (request.time_grain !== "none" && orderBy !== null) {
    throw new QueryError(
      "unsupported",
      "A trend over time is returned in chronological order, so it cannot also be ranked by a metric. Ask for either the trend or the ranking.",
      "order_by",
    );
  }

  if (request.time_grain === "none" && breakdown === null && orderBy !== null) {
    throw new QueryError(
      "unsupported",
      "Ranking requires a breakdown dimension or a time grain; a single scope value has nothing to rank.",
      "order_by",
    );
  }
}

async function validateFilterValues(
  filters: readonly QueryFilterInput[],
  ctx: QueryContext,
): Promise<void> {
  const vocabulary = filterVocabulary(ctx.manifest);

  for (const filter of filters) {
    if (filter.field === "sku") {
      // 355 SKUs are deliberately not embedded in the contract; membership is
      // checked against the imported data instead.
      for (const value of filter.values) {
        const found = await ctx.db.first<{ one: number }>(
          "SELECT 1 AS one FROM orders WHERE sku = ? LIMIT 1",
          [value],
        );
        if (found === null) {
          throw new QueryError(
            "unknown_value",
            `No orders exist for SKU ${JSON.stringify(value)}. Check the identifier or choose one from the data.`,
            "filters",
          );
        }
      }
      continue;
    }

    const allowed = vocabulary[filter.field];
    for (const value of filter.values) {
      if (!allowed.includes(value)) {
        const preview = allowed.slice(0, 8).join(", ");
        throw new QueryError(
          "unknown_value",
          `${JSON.stringify(value)} is not a known ${DIMENSION_LABELS[filter.field]}. Known values include: ${preview}${allowed.length > 8 ? ", …" : ""}.`,
          "filters",
        );
      }
    }
  }
}

function compileScope(
  scope: ResolvedScope,
  filters: readonly QueryFilterInput[],
  requireDate: boolean,
): CompiledScope {
  const dateColumn = DATE_FIELD_COLUMNS[scope.date_field];
  const clauses: string[] = ["1 = 1"];
  const params: unknown[] = [];

  if (scope.from !== null && scope.to !== null) {
    clauses.push(`${dateColumn} >= ?`, `${dateColumn} <= ?`);
    params.push(scope.from, scope.to);
  }

  // A time bucket cannot be derived from a missing date.
  if (requireDate) {
    clauses.push(`${dateColumn} IS NOT NULL`);
  }

  for (const filter of filters) {
    const column = DIMENSION_COLUMNS[filter.field];
    if (filter.op === "eq") {
      clauses.push(`${column} = ?`);
      params.push(filter.values[0]);
    } else {
      const placeholders = filter.values.map(() => "?").join(", ");
      clauses.push(`${column} IN (${placeholders})`);
      params.push(...filter.values);
    }
  }

  return { where: clauses.join(" AND "), params };
}

function selectList(metrics: readonly MetricId[]): string {
  const parts = metrics.flatMap((id) => metricAggregateParts(id));
  const aggregates = parts.map((part) => `${part.expression} AS ${part.alias}`);
  return ["COUNT(*) AS scope_row_count", ...aggregates].join(", ");
}

function toMetricValues(
  metrics: readonly MetricId[],
  row: Readonly<Record<string, unknown>>,
): readonly MetricValue[] {
  return metrics.map((id) => computeMetricValue(id, row));
}

function readCount(row: Readonly<Record<string, unknown>> | null): number {
  const raw = row?.["scope_row_count"];
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  return 0;
}

/**
 * Rank grouped rows. Undefined values sort last in both directions because an
 * undefined rate is not a small rate. Ties break on the group key so repeated
 * requests return the same order.
 */
function rankRows(
  rows: readonly QueryRow[],
  valueMetric: MetricId,
  direction: "asc" | "desc",
): readonly QueryRow[] {
  const valueOf = (row: QueryRow): number | null =>
    row.metrics.find((metric) => metric.metric === valueMetric)?.value ?? null;

  return [...rows].sort((left, right) => {
    const leftValue = valueOf(left);
    const rightValue = valueOf(right);
    if (leftValue === null && rightValue === null) {
      return (left.key ?? "").localeCompare(right.key ?? "");
    }
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (leftValue !== rightValue) {
      return direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
    }
    return (left.key ?? "").localeCompare(right.key ?? "");
  });
}

const STATUS_PROXY_DISCLOSURE =
  "Project assumption: order status is the delivery-outcome proxy. delivered stands for on time and delayed stands for late; exception records have an unknown outcome. The source has no promised delivery date or SLA threshold, so a status-filtered answer is a proxy, not an exact SLA measurement.";

/**
 * Assumptions a reader needs in order to interpret this result.
 *
 * Metric-level assumptions always apply. Filtering or grouping by status makes the
 * answer depend on the status proxy even when the metric itself is a plain count,
 * so that assumption is disclosed too.
 */
function collectAssumptions(
  metrics: readonly MetricId[],
  plan: CanonicalQueryPlan,
): readonly string[] {
  const seen = new Set<string>();
  for (const id of metrics) {
    for (const assumption of getMetric(id).assumptions) seen.add(assumption);
  }

  const usesStatus =
    plan.breakdown === "status" || plan.filters.some((filter) => filter.field === "status");
  if (usesStatus) seen.add(STATUS_PROXY_DISCLOSURE);

  if (plan.date_field === "delivery_date") {
    seen.add(
      "Records without a delivery date, which are in_transit and canceled orders, cannot appear in a delivery-date scope.",
    );
  }

  return [...seen];
}

function unitMap(metrics: readonly MetricId[]): Readonly<Partial<Record<MetricId, MetricUnit>>> {
  const units: Partial<Record<MetricId, MetricUnit>> = {};
  for (const id of metrics) units[id] = getMetric(id).unit;
  return units;
}

export async function runQuery(
  request: QueryRequest,
  ctx: QueryContext,
): Promise<QueryResponse> {
  assertSupportedCombination(request);

  let scope: ResolvedScope;
  try {
    scope = resolveDateScope(
      {
        date_field: request.date_field,
        date_context: request.date_context,
        relative_range: request.relative_range ?? null,
        date_from: request.date_from ?? null,
        date_to: request.date_to ?? null,
      },
      ctx.now,
    );
  } catch (error) {
    if (error instanceof DateScopeError) {
      throw new QueryError("bad_input", error.message, error.field);
    }
    throw error;
  }

  const filters = request.filters;
  await validateFilterValues(filters, ctx);

  const breakdown = request.breakdown ?? null;
  const grain = request.time_grain;
  const compiled = compileScope(scope, filters, grain !== "none");
  const select = selectList(request.metrics);

  const plan: CanonicalQueryPlan = {
    metrics: request.metrics,
    breakdown,
    time_grain: grain,
    date_field: request.date_field,
    date_context: request.date_context,
    relative_range: scope.relative_range,
    date_from: scope.from,
    date_to: scope.to,
    filters,
    order_by: request.order_by ?? null,
    order_dir: request.order_dir,
    limit: request.limit,
  };

  // Full-scope summary, independent of grouping, so a truncated ranking still
  // reports the totals it was drawn from.
  const summaryRow = await ctx.db.first<Record<string, unknown>>(
    `SELECT ${select} FROM orders WHERE ${compiled.where}`,
    compiled.params,
  );
  const summary = toMetricValues(request.metrics, summaryRow ?? {});
  const scopeRowCount = readCount(summaryRow);

  const warnings: string[] = [...dateScopeWarnings(scope)];
  let rows: readonly QueryRow[];
  let totalGroups: number;

  if (breakdown === null && grain === "none") {
    rows = [
      {
        key: null,
        label: "Whole scope",
        row_count: scopeRowCount,
        metrics: summary,
      },
    ];
    totalGroups = 1;
  } else {
    const groupExpression =
      breakdown !== null
        ? DIMENSION_COLUMNS[breakdown]
        : timeBucketExpression(grain as Exclude<TimeGrain, "none">, DATE_FIELD_COLUMNS[scope.date_field]);

    const grouped = await ctx.db.all<Record<string, unknown>>(
      `SELECT ${groupExpression} AS group_key, ${select} FROM orders WHERE ${compiled.where} GROUP BY ${groupExpression}`,
      compiled.params,
    );

    const allRows: QueryRow[] = grouped.map((row) => {
      const key = row["group_key"];
      const keyText = key === null || key === undefined ? null : String(key);
      return {
        key: keyText,
        label: keyText ?? "(none)",
        row_count: readCount(row),
        metrics: toMetricValues(request.metrics, row),
      };
    });

    totalGroups = allRows.length;

    if (grain !== "none") {
      // Chronological order for a trend.
      rows = [...allRows].sort((left, right) => (left.key ?? "").localeCompare(right.key ?? ""));
    } else {
      const valueMetric = request.order_by ?? request.metrics[0];
      rows = rankRows(allRows, valueMetric as MetricId, request.order_dir);
    }
    rows = rows.slice(0, request.limit);
  }

  const truncated = totalGroups > rows.length;
  if (truncated) {
    warnings.push(
      `${totalGroups} groups matched and the ${rows.length} shown were selected after ranking the full scope. Totals in the summary cover every matching record.`,
    );
  }

  const smallDenominator = rows.some((row) =>
    row.metrics.some(
      (metric) =>
        metric.denominator !== undefined && metric.denominator > 0 && metric.denominator < 10,
    ),
  );
  if (smallDenominator) {
    warnings.push(
      "Some groups have fewer than ten records in their rate denominator. Treat those percentages as indicative only.",
    );
  }

  if (scopeRowCount === 0) {
    warnings.push(
      "No records match this scope. Counts are zero and rates are undefined rather than zero.",
    );
  }

  return {
    plan,
    scope,
    rows,
    summary,
    scope_row_count: scopeRowCount,
    total_groups: totalGroups,
    returned_groups: rows.length,
    truncated,
    chart: selectChart(plan),
    units: unitMap(request.metrics),
    assumptions: collectAssumptions(request.metrics, plan),
    warnings,
    data_version: ctx.manifest.data_version,
    metric_version: ctx.manifest.metric_version,
  };
}
