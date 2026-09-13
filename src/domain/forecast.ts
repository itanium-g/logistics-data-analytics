/**
 * SKU demand forecast and inventory coverage target.
 *
 * What this computes: recorded non-canceled quantity per calendar month, a
 * declared moving-average baseline for the next one to four months, and a single
 * buffered coverage target.
 *
 * What this does not claim: accuracy, a confidence interval, a net purchase
 * quantity, a reorder point or a service level. The dataset supplies no stock on
 * hand, inbound supply, lead time, backorders or stockout observations, and three
 * rows per SKU cannot establish forecast quality. The method is a transparent
 * declared heuristic, not a statistically selected winner.
 */
import type { ForecastMethod, ForecastPoint, ForecastResponse } from "../shared/contracts.ts";
import { addMonthsToKey, monthKey, monthKeysBetween } from "./dates.ts";
import type { SqlDb } from "../shared/db.ts";
import { formatMonthKey } from "./format.ts";
import type { ForecastRequest } from "./forecast-schema.ts";
import type { StoredManifest } from "../data/manifest.ts";

export type ForecastErrorCode = "unknown_value" | "bad_input" | "unsupported";

export class ForecastError extends Error {
  readonly code: ForecastErrorCode;
  readonly field: string | undefined;

  constructor(code: ForecastErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ForecastError";
    this.code = code;
    this.field = field;
  }
}

export interface ForecastContext {
  readonly db: SqlDb;
  readonly manifest: StoredManifest;
}

/** At least this many non-zero months are needed before trusting a recent trend. */
export const TRAILING_METHOD_MIN_NON_ZERO_MONTHS = 6;
const TRAILING_WINDOW_MONTHS = 3;

const METHODS: Readonly<Record<ForecastMethod["id"], ForecastMethod>> = {
  sparse_12_month_mean: {
    id: "sparse_12_month_mean",
    label: "12-month mean of recorded monthly units",
    description:
      "Every future month repeats the mean of all twelve monthly quantities, including observed zero months. With sparse history a recent-months average would swing wildly, and zero months are treated as real observations rather than as a launch date. This is a declared heuristic chosen for transparency, not a statistically selected model.",
  },
  trailing_3_month_mean: {
    id: "trailing_3_month_mean",
    label: "Trailing 3-month mean of recorded monthly units",
    description:
      "Every future month repeats the mean of the last three monthly quantities. This is applied only when at least six months recorded non-zero demand, so a recent level is meaningful. It is a declared heuristic, not a statistically selected model.",
  },
};

function roundUnits(value: number): number {
  // Keep four decimals for display; arithmetic itself stays unrounded.
  return Math.round(value * 10_000) / 10_000;
}

export async function runForecast(
  request: ForecastRequest,
  ctx: ForecastContext,
): Promise<ForecastResponse> {
  const sku = request.sku;
  const coverage = ctx.manifest.assumed_coverage;

  // Distinguish an unknown identifier from a known SKU with no demand.
  const existence = await ctx.db.first<{ order_rows: number }>(
    "SELECT COUNT(*) AS order_rows FROM orders WHERE sku = ?",
    [sku],
  );
  if ((existence?.order_rows ?? 0) === 0) {
    throw new ForecastError(
      "unknown_value",
      `No orders exist for SKU ${JSON.stringify(sku)}. Check the identifier, or pick a SKU that appears in the data.`,
      "sku",
    );
  }

  const monthlyRows = await ctx.db.all<{ month: string; units: number; order_rows: number }>(
    `SELECT substr(order_date, 1, 7) AS month,
            SUM(quantity) AS units,
            COUNT(*) AS order_rows
     FROM orders
     WHERE sku = ?
       AND status <> 'canceled'
       AND order_date >= ?
       AND order_date <= ?
     GROUP BY substr(order_date, 1, 7)`,
    [sku, coverage.start, coverage.end],
  );

  const recorded = new Map<string, number>();
  let orderRows = 0;
  for (const row of monthlyRows) {
    recorded.set(row.month, Number(row.units));
    orderRows += Number(row.order_rows);
  }

  // Zero-fill the assumed observation grid. This is conditional on the coverage
  // assumption, which is reported as unverified.
  const historyMonths = monthKeysBetween(coverage.start, coverage.end);
  const history: ForecastPoint[] = historyMonths.map((month) => ({
    month,
    units: recorded.get(month) ?? 0,
    kind: "history",
  }));

  const totalUnits = history.reduce((sum, point) => sum + point.units, 0);
  const nonZeroMonths = history.filter((point) => point.units > 0).length;

  const useTrailing = nonZeroMonths >= TRAILING_METHOD_MIN_NON_ZERO_MONTHS;
  const method = useTrailing ? METHODS.trailing_3_month_mean : METHODS.sparse_12_month_mean;

  const monthlyForecastUnits = useTrailing
    ? history.slice(-TRAILING_WINDOW_MONTHS).reduce((sum, point) => sum + point.units, 0) /
      TRAILING_WINDOW_MONTHS
    : totalUnits / history.length;

  const lastHistoryMonth = historyMonths[historyMonths.length - 1] ?? monthKey(coverage.end);
  const forecast: ForecastPoint[] = Array.from(
    { length: request.horizon_months },
    (_unused, index) => ({
      month: addMonthsToKey(lastHistoryMonth, index + 1),
      units: monthlyForecastUnits,
      kind: "forecast" as const,
    }),
  );

  // Round once, after summing the horizon and applying the buffer.
  const baseDemandUnits = monthlyForecastUnits * request.horizon_months;
  const bufferUnits = baseDemandUnits * (request.buffer_pct / 100);
  const coverageTargetUnits = Math.ceil(baseDemandUnits * (1 + request.buffer_pct / 100));

  const firstForecastMonth = forecast[0]?.month ?? lastHistoryMonth;
  const lastForecastMonth = forecast[forecast.length - 1]?.month ?? lastHistoryMonth;
  const horizonLabel =
    forecast.length === 1
      ? formatMonthKey(firstForecastMonth)
      : `${formatMonthKey(firstForecastMonth)} to ${formatMonthKey(lastForecastMonth)}`;

  const recommendation =
    `Plan coverage for ${coverageTargetUnits} unit${coverageTargetUnits === 1 ? "" : "s"} of ${sku} over ${horizonLabel}, ` +
    `from a baseline of ${roundUnits(baseDemandUnits)} units plus a ${request.buffer_pct}% buffer. ` +
    `Compare this with usable stock on hand and inbound supply before ordering.`;

  const warnings: string[] = [];
  if (!useTrailing) {
    warnings.push(
      `${sku} recorded demand in only ${nonZeroMonths} of ${history.length} months (${orderRows} order row${orderRows === 1 ? "" : "s"}, ${totalUnits} unit${totalUnits === 1 ? "" : "s"} in total). This is an illustrative baseline, not a validated forecast.`,
    );
  }
  if (totalUnits === 0) {
    warnings.push(
      `${sku} appears in the data but recorded no non-canceled units in the coverage window, so the forecast is zero.`,
    );
  }
  warnings.push(
    `Forecasts are made as of ${coverage.end}, the end of the assumed historical coverage. They describe ${horizonLabel}; they are not advice about the current date.`,
  );
  warnings.push(
    `Coverage of ${coverage.start} to ${coverage.end} is assumed complete for this synthetic dataset and is reported as ${coverage.status}. Zero-filled months depend on that assumption.`,
  );

  return {
    scope: "sku",
    sku,
    horizon_months: request.horizon_months,
    buffer_pct: request.buffer_pct,
    method,
    units: "units",
    as_of_date: coverage.end,
    history_range: { start: coverage.start, end: coverage.end },
    coverage_status: coverage.status,
    history,
    forecast,
    sample: {
      order_rows: orderRows,
      non_zero_months: nonZeroMonths,
      total_units: totalUnits,
    },
    monthly_forecast_units: monthlyForecastUnits,
    base_demand_units: baseDemandUnits,
    buffer_units: bufferUnits,
    coverage_target_units: coverageTargetUnits,
    recommendation,
    assumptions: [
      "Demand is recorded non-canceled quantity. Canceled orders are excluded and no latent or lost demand is estimated.",
      `Months with no recorded orders are treated as zero demand, which depends on the assumed complete coverage window ${coverage.start} to ${coverage.end}.`,
      "The baseline repeats one monthly average across the horizon; no seasonality, trend or promotion effect is modelled.",
      "The coverage target is a demand-coverage figure: the horizon baseline plus a visible buffer, rounded up once.",
    ],
    warnings,
    limitations: [
      "This is not a net purchase quantity. Stock on hand, inbound supply, lead times and backorders are absent from the dataset.",
      "No confidence interval, accuracy measure or backtest is claimed. Twelve sparse monthly observations cannot establish forecast quality.",
      "The buffer is a visible planning choice, not a calibrated safety stock or a service-level guarantee.",
      "Category-level forecasts, custom horizon start dates and alternative methods are outside the supported subset.",
    ],
    data_version: ctx.manifest.data_version,
    metric_version: ctx.manifest.metric_version,
  };
}
