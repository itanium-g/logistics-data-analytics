/**
 * Presentation formatting for computed values.
 *
 * This lives in the domain rather than the web layer because the natural-language
 * answer text is rendered from the same computed fields as the dashboard. One
 * formatter means a number can never be phrased one way in a card and another way
 * in a sentence.
 *
 * Month names are a fixed table rather than Intl output so a label does not
 * change with the host locale.
 */
import type {
  MetricValue,
  ResolvedScope,
  TimeGrain,
} from "../shared/contracts.ts";
import { formatCents } from "./money.ts";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const NOT_AVAILABLE = "N/A";

function groupDigits(value: string): string {
  const [whole = "", fraction] = value.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign === "-" ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

/** Format a metric for display, including its unit. Null becomes N/A. */
export function formatMetricValue(metric: MetricValue): string {
  if (metric.value === null) return NOT_AVAILABLE;
  switch (metric.unit) {
    case "fraction":
      return `${(metric.value * 100).toFixed(2)}%`;
    case "days":
      return `${metric.value.toFixed(2)} days`;
    case "cents":
      return `USD ${groupDigits(formatCents(Math.round(metric.value)))}`;
    case "orders":
    case "units":
      return groupDigits(String(Math.round(metric.value)));
  }
}

/** Plain number for chart axes: percentages become 0-100, money becomes dollars. */
export function chartValue(metric: MetricValue): number | null {
  if (metric.value === null) return null;
  if (metric.unit === "fraction") return metric.value * 100;
  if (metric.unit === "cents") return metric.value / 100;
  return metric.value;
}

export function axisSuffix(unit: MetricValue["unit"]): string {
  switch (unit) {
    case "fraction":
      return "%";
    case "days":
      return " days";
    case "cents":
      return " USD";
    default:
      return "";
  }
}

/**
 * The supporting detail behind a value: the components of a ratio, the eligible
 * count of an average, or the reason a value is undefined.
 */
export function describeMetricBasis(metric: MetricValue): string {
  if (metric.value === null) {
    return metric.note ?? "Undefined in this scope.";
  }
  if (metric.numerator !== undefined && metric.denominator !== undefined) {
    return `${groupDigits(String(metric.numerator))} of ${groupDigits(String(metric.denominator))} records`;
  }
  if (metric.eligible_count !== undefined) {
    return `${groupDigits(String(metric.eligible_count))} eligible records`;
  }
  return "";
}

/** "12 Oct 2025" from an ISO calendar date. */
export function formatIsoDate(value: string): string {
  const year = value.slice(0, 4);
  const monthIndex = Number.parseInt(value.slice(5, 7), 10) - 1;
  const day = Number.parseInt(value.slice(8, 10), 10);
  const month = MONTH_NAMES[monthIndex] ?? value.slice(5, 7);
  return `${day} ${month} ${year}`;
}

/** "Oct 2025" from a "YYYY-MM" key. */
export function formatMonthKey(value: string): string {
  const year = value.slice(0, 4);
  const monthIndex = Number.parseInt(value.slice(5, 7), 10) - 1;
  return `${MONTH_NAMES[monthIndex] ?? value.slice(5, 7)} ${year}`;
}

/** Label a group key according to the grain that produced it. */
export function formatGroupLabel(key: string | null, grain: TimeGrain): string {
  if (key === null) return "Whole scope";
  switch (grain) {
    case "month":
      return formatMonthKey(key);
    case "week":
      return `Week of ${formatIsoDate(key)}`;
    case "day":
      return formatIsoDate(key);
    case "none":
      return key;
  }
}

/** One sentence describing exactly which records were counted. */
export function describeScope(scope: ResolvedScope): string {
  const field = scope.date_field === "order_date" ? "Order date" : "Delivery date";
  const range =
    scope.from === null || scope.to === null
      ? "all available dates"
      : `${formatIsoDate(scope.from)} to ${formatIsoDate(scope.to)}`;
  const mode =
    scope.date_context === "dataset"
      ? `dataset mode, reference ${formatIsoDate(scope.reference_date)}`
      : `current mode, today ${formatIsoDate(scope.reference_date)}`;
  return `${field} ${range} (${mode})`;
}
