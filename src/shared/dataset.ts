/**
 * Canonical dataset constants.
 *
 * These describe the supplied read-only dataset and the project's explicit
 * semantic choices. Everything here is shared by the importer, the domain layer
 * and the API so the dashboard and the natural-language path can never diverge.
 */

/** Exact 17 columns of the supplied CSV, in file order. */
export const CSV_COLUMNS = [
  "client_id",
  "order_id",
  "order_date",
  "delivery_date",
  "carrier",
  "origin_city",
  "destination_city",
  "status",
  "sku",
  "product_category",
  "quantity",
  "unit_price_usd",
  "order_value_usd",
  "is_promo",
  "promo_discount_pct",
  "region",
  "warehouse",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** SHA-256 of the supplied mock_logistics_data.csv, from docs/assignment/README.md. */
export const SUPPLIED_CSV_SHA256 =
  "b60f84b18aacc1a76b6d401ba0c290a0efd1f2729734224d65608e941594bc82";

export const ORDER_STATUSES = [
  "delivered",
  "delayed",
  "exception",
  "in_transit",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Statuses treated as observed delivery outcomes under metric version 2.
 * `delivered` is the on-time proxy and `delayed` is the late proxy. `exception`
 * has an unknown outcome and is deliberately excluded from rate denominators;
 * `in_transit` and `canceled` have no outcome at all. These are project
 * assumptions, not employer-defined facts: the dataset supplies no promised
 * delivery date and no SLA threshold.
 */
export const DELIVERY_OUTCOME_STATUSES = ["delivered", "delayed"] as const;

/** Statuses excluded from demand quantity. */
export const NON_DEMAND_STATUSES = ["canceled"] as const;

/**
 * Assumed complete synthetic observation window. The last order is dated
 * 2025-12-30, which proves neither completeness nor incompleteness, so this is
 * recorded as an assumption and every forecast returns coverage_unverified.
 */
export const ASSUMED_COVERAGE_START = "2025-01-01";
export const ASSUMED_COVERAGE_END = "2025-12-31";

/**
 * Reference date for dataset mode: the day after assumed coverage ends. Makes
 * "last month" mean December 2025 for a reviewer, without pretending this is
 * the current date.
 */
export const DATASET_REFERENCE_DATE = "2026-01-01";

/** Bumped when import semantics or stored columns change. */
export const DATA_VERSION = "1.0.0";

/** Bumped when a metric formula changes. Version 2 is the status-proxy set. */
export const METRIC_VERSION = "2";
