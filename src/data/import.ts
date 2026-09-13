/**
 * Import validation and dataset statistics.
 *
 * Pure functions only, so the same logic runs under the importer script and
 * under tests. Invalid rows are reported with row and field diagnostics and are
 * never silently dropped or repaired.
 */
import {
  CSV_COLUMNS,
  DELIVERY_OUTCOME_STATUSES,
  NON_DEMAND_STATUSES,
  ORDER_STATUSES,
  type OrderStatus,
} from "../shared/dataset.ts";
import { compareIsoDates, daysBetween, isIsoDate, monthKey } from "../domain/dates.ts";
import { parseUsdToCents } from "../domain/money.ts";

export interface OrderRow {
  readonly order_id: string;
  readonly client_id: string;
  readonly order_date: string;
  readonly delivery_date: string | null;
  readonly carrier: string;
  readonly origin_city: string;
  readonly destination_city: string;
  readonly status: OrderStatus;
  readonly sku: string;
  readonly product_category: string;
  readonly quantity: number;
  readonly unit_price_cents: number;
  readonly order_value_cents: number;
  readonly is_promo: 0 | 1;
  readonly promo_discount_pct: number;
  readonly region: string;
  readonly warehouse: string;
  readonly delivery_days: number | null;
}

export interface RowIssue {
  /** 1-based line number in the source file, counting the header as line 1. */
  readonly line: number;
  readonly field: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly rows: readonly OrderRow[];
  readonly errors: readonly RowIssue[];
  readonly warnings: readonly RowIssue[];
}

export interface MonthlyControl {
  readonly month: string;
  readonly orders: number;
  readonly nonCanceledUnits: number;
}

export interface DatasetStats {
  readonly rowCount: number;
  readonly uniqueOrderIds: number;
  readonly observedOrderDateMin: string;
  readonly observedOrderDateMax: string;
  readonly observedDeliveryDateMax: string | null;
  readonly statusCounts: Readonly<Record<OrderStatus, number>>;
  readonly datedDeliveryCount: number;
  readonly missingDeliveryDateCount: number;
  readonly totalQuantity: number;
  readonly nonCanceledQuantity: number;
  readonly rawOrderValueCents: number;
  readonly delayedOrExceptionValueCents: number;
  readonly deliveryOutcomeCount: number;
  readonly deliveryOutcomeDaysTotal: number;
  readonly deliveredOnlyDaysTotal: number;
  readonly allDatedDaysTotal: number;
  readonly promoRowCount: number;
  readonly valueMismatchCount: number;
  readonly negativeDurationCount: number;
  readonly skuRowCountBuckets: Readonly<Record<string, number>>;
  readonly monthly: readonly MonthlyControl[];
  readonly vocabulary: {
    readonly carriers: readonly string[];
    readonly regions: readonly string[];
    readonly product_categories: readonly string[];
    readonly warehouses: readonly string[];
    readonly clients: readonly string[];
    readonly statuses: readonly string[];
    readonly destination_cities: readonly string[];
    readonly skus: readonly string[];
    readonly sku_count: number;
  };
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PERCENT_PATTERN = /^\d+(?:\.\d+)?$/;

/** Verify the header matches the expected 17 columns in the expected order. */
export function validateHeader(header: readonly string[]): readonly RowIssue[] {
  const issues: RowIssue[] = [];
  if (header.length !== CSV_COLUMNS.length) {
    issues.push({
      line: 1,
      field: "header",
      message: `Expected ${CSV_COLUMNS.length} columns, found ${header.length}`,
    });
  }
  CSV_COLUMNS.forEach((expected, index) => {
    const actual = header[index];
    if (actual !== expected) {
      issues.push({
        line: 1,
        field: expected,
        message: `Expected column ${index + 1} to be "${expected}", found ${JSON.stringify(actual ?? null)}`,
      });
    }
  });
  return issues;
}

function requireText(
  record: Readonly<Record<string, string>>,
  field: string,
  line: number,
  errors: RowIssue[],
  options: { identifier?: boolean } = {},
): string {
  const raw = (record[field] ?? "").trim();
  if (raw === "") {
    errors.push({ line, field, message: "Required value is empty" });
    return "";
  }
  if (options.identifier === true && !IDENTIFIER_PATTERN.test(raw)) {
    errors.push({
      line,
      field,
      message: `Identifier contains unexpected characters: ${JSON.stringify(raw)}`,
    });
  }
  return raw;
}

/**
 * Validate parsed CSV records. Every field is checked; a row with any error is
 * excluded from the returned rows and reported instead.
 */
export function validateRows(
  records: readonly Readonly<Record<string, string>>[],
): ValidationResult {
  const rows: OrderRow[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const seenOrderIds = new Set<string>();

  records.forEach((record, index) => {
    // Header occupies line 1, so the first record is line 2.
    const line = index + 2;
    const before = errors.length;

    const orderId = requireText(record, "order_id", line, errors, { identifier: true });
    if (orderId !== "") {
      if (seenOrderIds.has(orderId)) {
        errors.push({ line, field: "order_id", message: `Duplicate order_id ${orderId}` });
      } else {
        seenOrderIds.add(orderId);
      }
    }

    const clientId = requireText(record, "client_id", line, errors, { identifier: true });
    const carrier = requireText(record, "carrier", line, errors);
    const originCity = requireText(record, "origin_city", line, errors);
    const destinationCity = requireText(record, "destination_city", line, errors);
    const sku = requireText(record, "sku", line, errors, { identifier: true });
    const productCategory = requireText(record, "product_category", line, errors);
    const region = requireText(record, "region", line, errors);
    const warehouse = requireText(record, "warehouse", line, errors);

    const orderDateRaw = (record["order_date"] ?? "").trim();
    if (!isIsoDate(orderDateRaw)) {
      errors.push({
        line,
        field: "order_date",
        message: `Expected a real YYYY-MM-DD date; received ${JSON.stringify(orderDateRaw)}`,
      });
    }

    const deliveryDateRaw = (record["delivery_date"] ?? "").trim();
    let deliveryDate: string | null = null;
    if (deliveryDateRaw !== "") {
      if (!isIsoDate(deliveryDateRaw)) {
        errors.push({
          line,
          field: "delivery_date",
          message: `Expected a real YYYY-MM-DD date or an empty value; received ${JSON.stringify(deliveryDateRaw)}`,
        });
      } else {
        deliveryDate = deliveryDateRaw;
      }
    }

    const statusRaw = (record["status"] ?? "").trim();
    if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
      errors.push({
        line,
        field: "status",
        message: `Expected one of ${ORDER_STATUSES.join(", ")}; received ${JSON.stringify(statusRaw)}`,
      });
    }
    const status = statusRaw as OrderStatus;

    const quantityRaw = (record["quantity"] ?? "").trim();
    let quantity = 0;
    if (!/^\d+$/.test(quantityRaw)) {
      errors.push({
        line,
        field: "quantity",
        message: `Expected a positive integer; received ${JSON.stringify(quantityRaw)}`,
      });
    } else {
      quantity = Number.parseInt(quantityRaw, 10);
      if (quantity <= 0) {
        errors.push({ line, field: "quantity", message: "Quantity must be greater than zero" });
      }
    }

    let unitPriceCents = 0;
    try {
      unitPriceCents = parseUsdToCents(record["unit_price_usd"] ?? "");
    } catch (error) {
      errors.push({
        line,
        field: "unit_price_usd",
        message: error instanceof Error ? error.message : "Invalid amount",
      });
    }

    let orderValueCents = 0;
    try {
      orderValueCents = parseUsdToCents(record["order_value_usd"] ?? "");
    } catch (error) {
      errors.push({
        line,
        field: "order_value_usd",
        message: error instanceof Error ? error.message : "Invalid amount",
      });
    }

    const isPromoRaw = (record["is_promo"] ?? "").trim();
    if (isPromoRaw !== "0" && isPromoRaw !== "1") {
      errors.push({
        line,
        field: "is_promo",
        message: `Expected 0 or 1; received ${JSON.stringify(isPromoRaw)}`,
      });
    }
    const isPromo: 0 | 1 = isPromoRaw === "1" ? 1 : 0;

    const promoRaw = (record["promo_discount_pct"] ?? "").trim();
    let promoDiscountPct = 0;
    if (!PERCENT_PATTERN.test(promoRaw)) {
      errors.push({
        line,
        field: "promo_discount_pct",
        message: `Expected a non-negative number; received ${JSON.stringify(promoRaw)}`,
      });
    } else {
      promoDiscountPct = Number.parseFloat(promoRaw);
      if (promoDiscountPct > 100) {
        errors.push({
          line,
          field: "promo_discount_pct",
          message: `Expected a percentage of at most 100; received ${promoRaw}`,
        });
      }
    }

    // Cross-field checks only run when the individual fields parsed.
    let deliveryDays: number | null = null;
    if (errors.length === before) {
      if (deliveryDate !== null) {
        if (compareIsoDates(deliveryDate, orderDateRaw) < 0) {
          errors.push({
            line,
            field: "delivery_date",
            message: `delivery_date ${deliveryDate} precedes order_date ${orderDateRaw}`,
          });
        } else {
          deliveryDays = daysBetween(orderDateRaw, deliveryDate);
        }
      }

      if (quantity * unitPriceCents !== orderValueCents) {
        // Reported rather than corrected: silently overwriting supplied money
        // would hide a real data defect.
        errors.push({
          line,
          field: "order_value_usd",
          message: `order_value_usd ${record["order_value_usd"] ?? ""} does not equal quantity ${quantity} x unit_price_usd ${record["unit_price_usd"] ?? ""}`,
        });
      }

      const expectsDeliveryDate = (
        ["delivered", "delayed", "exception"] as readonly string[]
      ).includes(status);
      if (expectsDeliveryDate && deliveryDate === null) {
        warnings.push({
          line,
          field: "delivery_date",
          message: `Status ${status} has no delivery_date; it is excluded from delivery-date scopes`,
        });
      }
      if (!expectsDeliveryDate && deliveryDate !== null) {
        warnings.push({
          line,
          field: "delivery_date",
          message: `Status ${status} carries a delivery_date; a date on this status does not establish delivery`,
        });
      }
    }

    if (errors.length !== before) return;

    rows.push({
      order_id: orderId,
      client_id: clientId,
      order_date: orderDateRaw,
      delivery_date: deliveryDate,
      carrier,
      origin_city: originCity,
      destination_city: destinationCity,
      status,
      sku,
      product_category: productCategory,
      quantity,
      unit_price_cents: unitPriceCents,
      order_value_cents: orderValueCents,
      is_promo: isPromo,
      promo_discount_pct: promoDiscountPct,
      region,
      warehouse,
      delivery_days: deliveryDays,
    });
  });

  return { rows, errors, warnings };
}

function sortedUnique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Compute every control total recorded in docs/data-audit.md. */
export function computeDatasetStats(rows: readonly OrderRow[]): DatasetStats {
  const statusCounts: Record<OrderStatus, number> = {
    delivered: 0,
    delayed: 0,
    exception: 0,
    in_transit: 0,
    canceled: 0,
  };

  const monthlyOrders = new Map<string, number>();
  const monthlyUnits = new Map<string, number>();
  const skuRowCounts = new Map<string, number>();

  let observedOrderDateMin = "";
  let observedOrderDateMax = "";
  let observedDeliveryDateMax: string | null = null;
  let datedDeliveryCount = 0;
  let totalQuantity = 0;
  let nonCanceledQuantity = 0;
  let rawOrderValueCents = 0;
  let delayedOrExceptionValueCents = 0;
  let deliveryOutcomeCount = 0;
  let deliveryOutcomeDaysTotal = 0;
  let deliveredOnlyDaysTotal = 0;
  let allDatedDaysTotal = 0;
  let promoRowCount = 0;
  let valueMismatchCount = 0;
  let negativeDurationCount = 0;

  for (const row of rows) {
    statusCounts[row.status] += 1;

    if (observedOrderDateMin === "" || row.order_date < observedOrderDateMin) {
      observedOrderDateMin = row.order_date;
    }
    if (observedOrderDateMax === "" || row.order_date > observedOrderDateMax) {
      observedOrderDateMax = row.order_date;
    }

    if (row.delivery_date !== null) {
      datedDeliveryCount += 1;
      if (observedDeliveryDateMax === null || row.delivery_date > observedDeliveryDateMax) {
        observedDeliveryDateMax = row.delivery_date;
      }
    }

    totalQuantity += row.quantity;
    const isDemand = !(NON_DEMAND_STATUSES as readonly string[]).includes(row.status);
    if (isDemand) nonCanceledQuantity += row.quantity;

    rawOrderValueCents += row.order_value_cents;
    if (row.status === "delayed" || row.status === "exception") {
      delayedOrExceptionValueCents += row.order_value_cents;
    }

    if ((DELIVERY_OUTCOME_STATUSES as readonly string[]).includes(row.status)) {
      deliveryOutcomeCount += 1;
      if (row.delivery_days !== null) deliveryOutcomeDaysTotal += row.delivery_days;
    }
    if (row.status === "delivered" && row.delivery_days !== null) {
      deliveredOnlyDaysTotal += row.delivery_days;
    }
    if (row.delivery_days !== null) {
      allDatedDaysTotal += row.delivery_days;
      if (row.delivery_days < 0) negativeDurationCount += 1;
    }

    if (row.is_promo === 1) promoRowCount += 1;
    if (row.quantity * row.unit_price_cents !== row.order_value_cents) valueMismatchCount += 1;

    const month = monthKey(row.order_date);
    monthlyOrders.set(month, (monthlyOrders.get(month) ?? 0) + 1);
    if (isDemand) monthlyUnits.set(month, (monthlyUnits.get(month) ?? 0) + row.quantity);

    skuRowCounts.set(row.sku, (skuRowCounts.get(row.sku) ?? 0) + 1);
  }

  const skuRowCountBuckets: Record<string, number> = {};
  for (const count of skuRowCounts.values()) {
    const key = String(count);
    skuRowCountBuckets[key] = (skuRowCountBuckets[key] ?? 0) + 1;
  }

  const monthly: MonthlyControl[] = [...monthlyOrders.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((month) => ({
      month,
      orders: monthlyOrders.get(month) ?? 0,
      nonCanceledUnits: monthlyUnits.get(month) ?? 0,
    }));

  return {
    rowCount: rows.length,
    uniqueOrderIds: new Set(rows.map((row) => row.order_id)).size,
    observedOrderDateMin,
    observedOrderDateMax,
    observedDeliveryDateMax,
    statusCounts,
    datedDeliveryCount,
    missingDeliveryDateCount: rows.length - datedDeliveryCount,
    totalQuantity,
    nonCanceledQuantity,
    rawOrderValueCents,
    delayedOrExceptionValueCents,
    deliveryOutcomeCount,
    deliveryOutcomeDaysTotal,
    deliveredOnlyDaysTotal,
    allDatedDaysTotal,
    promoRowCount,
    valueMismatchCount,
    negativeDurationCount,
    skuRowCountBuckets,
    monthly,
    vocabulary: {
      carriers: sortedUnique(rows.map((row) => row.carrier)),
      regions: sortedUnique(rows.map((row) => row.region)),
      product_categories: sortedUnique(rows.map((row) => row.product_category)),
      warehouses: sortedUnique(rows.map((row) => row.warehouse)),
      clients: sortedUnique(rows.map((row) => row.client_id)),
      statuses: sortedUnique(rows.map((row) => row.status)),
      destination_cities: sortedUnique(rows.map((row) => row.destination_city)),
      skus: sortedUnique(skuRowCounts.keys()),
      sku_count: skuRowCounts.size,
    },
  };
}
