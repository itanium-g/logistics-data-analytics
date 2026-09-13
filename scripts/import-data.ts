/**
 * Offline importer for the supplied read-only dataset.
 *
 * Reads the user-supplied CSV from an explicit path, verifies its checksum,
 * validates every field, and emits a deterministic seed script plus a provenance
 * manifest. It never contacts the network and never writes to the usage table.
 *
 *   npm run data:import
 *   npm run data:import -- --input /path/to/mock_logistics_data.csv
 */
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  computeDatasetStats,
  validateHeader,
  validateRows,
  type DatasetStats,
  type RowIssue,
} from "../src/data/import.ts";
import { formatCents } from "../src/domain/money.ts";
import { buildSeedSql } from "../src/data/seed-sql.ts";
import {
  ASSUMED_COVERAGE_END,
  ASSUMED_COVERAGE_START,
  CSV_COLUMNS,
  DATASET_REFERENCE_DATE,
  DATA_VERSION,
  METRIC_VERSION,
  SUPPLIED_CSV_SHA256,
} from "../src/shared/dataset.ts";
import { SUPPLIED_FIXTURE_CONTROLS } from "../src/shared/fixture-controls.ts";

interface Options {
  readonly input: string;
  readonly seedOut: string;
  readonly manifestOut: string;
  readonly importedAt: string;
  readonly allowChecksumMismatch: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const defaults: Options = {
    input: path.join("docs", "assignment", "mock_logistics_data.csv"),
    seedOut: path.join(".generated", "seed.sql"),
    manifestOut: path.join("data", "manifest.json"),
    importedAt: new Date().toISOString(),
    allowChecksumMismatch: false,
  };
  const overrides: Record<string, string> = {};
  let allowChecksumMismatch = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--allow-checksum-mismatch") {
      allowChecksumMismatch = true;
      continue;
    }
    const match = /^--([a-z-]+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unrecognized argument ${JSON.stringify(arg)}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${arg} requires a value`);
    }
    overrides[match[1] ?? ""] = value;
    index += 1;
  }

  const unknown = Object.keys(overrides).filter(
    (key) => !["input", "seed-out", "manifest-out", "imported-at"].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  }

  return {
    input: overrides["input"] ?? defaults.input,
    seedOut: overrides["seed-out"] ?? defaults.seedOut,
    manifestOut: overrides["manifest-out"] ?? defaults.manifestOut,
    importedAt: overrides["imported-at"] ?? defaults.importedAt,
    allowChecksumMismatch,
  };
}

function buildManifest(
  options: Options,
  stats: DatasetStats,
  checksum: string,
  byteLength: number,
  warnings: readonly RowIssue[],
): Record<string, unknown> {
  return {
    data_version: DATA_VERSION,
    metric_version: METRIC_VERSION,
    imported_at: options.importedAt,
    source: {
      file: path.basename(options.input),
      sha256: checksum,
      bytes: byteLength,
      checksum_matches_supplied_fixture: checksum === SUPPLIED_CSV_SHA256,
    },
    schema: {
      column_count: CSV_COLUMNS.length,
      columns: [...CSV_COLUMNS],
    },
    observed: {
      row_count: stats.rowCount,
      unique_order_ids: stats.uniqueOrderIds,
      order_date_min: stats.observedOrderDateMin,
      order_date_max: stats.observedOrderDateMax,
      delivery_date_max: stats.observedDeliveryDateMax,
      status_counts: stats.statusCounts,
      dated_delivery_count: stats.datedDeliveryCount,
      missing_delivery_date_count: stats.missingDeliveryDateCount,
      total_quantity: stats.totalQuantity,
      non_canceled_quantity: stats.nonCanceledQuantity,
      raw_order_value_cents: stats.rawOrderValueCents,
      delayed_or_exception_value_cents: stats.delayedOrExceptionValueCents,
      delivery_outcome_count: stats.deliveryOutcomeCount,
      delivery_outcome_days_total: stats.deliveryOutcomeDaysTotal,
      promo_row_count: stats.promoRowCount,
      sku_row_count_buckets: stats.skuRowCountBuckets,
      monthly: stats.monthly,
    },
    /**
     * Assumed coverage is recorded separately from observed bounds. The last
     * order is dated 2025-12-30, which proves neither completeness nor
     * incompleteness of the window.
     */
    assumed_coverage: {
      start: ASSUMED_COVERAGE_START,
      end: ASSUMED_COVERAGE_END,
      status: "coverage_unverified",
      basis: "Complete synthetic observation window assumed for this demo dataset.",
    },
    dataset_reference_date: DATASET_REFERENCE_DATE,
    vocabulary: stats.vocabulary,
    assumptions: [
      "delivered is the on-time proxy and delayed is the late proxy; no promised delivery date or SLA threshold exists in the source.",
      "exception rows have an unknown outcome and are excluded from on-time and delay rate denominators.",
      "in_transit and canceled rows have no delivery outcome and carry no delivery_date.",
      "Order value is the raw supplied amount; it is not net revenue and promotion discounts are not subtracted.",
      "Order identifiers contain 2026 while all dates are 2025; identifiers are opaque and never parsed for dates.",
      "delivery_days is derived at import as whole calendar days between order_date and delivery_date.",
    ],
    import_warnings: warnings,
  };
}

interface ControlMismatch {
  readonly control: string;
  readonly expected: string;
  readonly actual: string;
}

function checkFixtureControls(stats: DatasetStats): readonly ControlMismatch[] {
  const expected = SUPPLIED_FIXTURE_CONTROLS;
  const mismatches: ControlMismatch[] = [];
  const compare = (control: string, expectedValue: unknown, actualValue: unknown): void => {
    const expectedText = JSON.stringify(expectedValue);
    const actualText = JSON.stringify(actualValue);
    if (expectedText !== actualText) {
      mismatches.push({ control, expected: expectedText, actual: actualText });
    }
  };

  compare("row_count", expected.rowCount, stats.rowCount);
  compare("unique_order_ids", expected.uniqueOrderIds, stats.uniqueOrderIds);
  compare("order_date_min", expected.observedOrderDateMin, stats.observedOrderDateMin);
  compare("order_date_max", expected.observedOrderDateMax, stats.observedOrderDateMax);
  compare("delivery_date_max", expected.observedDeliveryDateMax, stats.observedDeliveryDateMax);
  compare("status_counts", expected.statusCounts, stats.statusCounts);
  compare("dated_delivery_count", expected.datedDeliveryCount, stats.datedDeliveryCount);
  compare("total_quantity", expected.totalQuantity, stats.totalQuantity);
  compare("non_canceled_quantity", expected.nonCanceledQuantity, stats.nonCanceledQuantity);
  compare("raw_order_value_cents", expected.rawOrderValueCents, stats.rawOrderValueCents);
  compare(
    "delayed_or_exception_value_cents",
    expected.delayedOrExceptionValueCents,
    stats.delayedOrExceptionValueCents,
  );
  compare("delivery_outcome_count", expected.deliveryOutcomeCount, stats.deliveryOutcomeCount);
  compare(
    "delivery_outcome_days_total",
    expected.deliveryOutcomeDaysTotal,
    stats.deliveryOutcomeDaysTotal,
  );
  compare("delivered_only_days_total", expected.deliveredOnlyDaysTotal, stats.deliveredOnlyDaysTotal);
  compare("all_dated_days_total", expected.allDatedDaysTotal, stats.allDatedDaysTotal);
  compare("promo_row_count", expected.promoRowCount, stats.promoRowCount);
  compare("value_mismatch_count", expected.valueMismatchCount, stats.valueMismatchCount);
  compare("negative_duration_count", expected.negativeDurationCount, stats.negativeDurationCount);
  compare("distinct_skus", expected.distinctSkus, stats.vocabulary.sku_count);
  compare("distinct_categories", expected.distinctCategories, stats.vocabulary.product_categories.length);
  compare("distinct_carriers", expected.distinctCarriers, stats.vocabulary.carriers.length);
  compare("distinct_clients", expected.distinctClients, stats.vocabulary.clients.length);
  compare("distinct_regions", expected.distinctRegions, stats.vocabulary.regions.length);
  compare("distinct_warehouses", expected.distinctWarehouses, stats.vocabulary.warehouses.length);
  compare("sku_row_count_buckets", expected.skuRowCountBuckets, stats.skuRowCountBuckets);
  compare("monthly", expected.monthly, stats.monthly);
  return mismatches;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);

  let content: Buffer;
  try {
    content = readFileSync(inputPath);
  } catch {
    console.error(`Cannot read input file: ${inputPath}`);
    console.error(
      "Supply the user-provided CSV path with --input, for example:\n" +
        "  npm run data:import -- --input C:/path/to/mock_logistics_data.csv",
    );
    process.exit(1);
    return;
  }

  const checksum = createHash("sha256").update(content).digest("hex");
  const checksumMatches = checksum === SUPPLIED_CSV_SHA256;
  console.log(`Input        ${inputPath}`);
  console.log(`Bytes        ${content.byteLength}`);
  console.log(`SHA-256      ${checksum}`);
  if (checksumMatches) {
    console.log("Checksum     matches the supplied fixture recorded in docs/assignment/README.md");
  } else if (options.allowChecksumMismatch) {
    console.log(
      "Checksum     DOES NOT match the supplied fixture; continuing because --allow-checksum-mismatch was given",
    );
  } else {
    console.error(
      `Checksum mismatch. Expected ${SUPPLIED_CSV_SHA256}.\n` +
        "Pass --allow-checksum-mismatch only if you intend to import a different dataset.",
    );
    process.exit(1);
    return;
  }

  const table = parse(content, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as string[][];

  const header = table[0] ?? [];
  const headerIssues = validateHeader(header);
  if (headerIssues.length > 0) {
    console.error("Header validation failed:");
    for (const issue of headerIssues) {
      console.error(`  line ${issue.line} field ${issue.field}: ${issue.message}`);
    }
    process.exit(1);
    return;
  }

  const records = table.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    return record;
  });

  const { rows, errors, warnings } = validateRows(records);

  if (errors.length > 0) {
    console.error(`\nRejected ${errors.length} field error(s). No output was written.`);
    for (const issue of errors.slice(0, 25)) {
      console.error(`  line ${issue.line} field ${issue.field}: ${issue.message}`);
    }
    if (errors.length > 25) console.error(`  ...and ${errors.length - 25} more`);
    process.exit(1);
    return;
  }

  const stats = computeDatasetStats(rows);

  if (checksumMatches) {
    const mismatches = checkFixtureControls(stats);
    if (mismatches.length > 0) {
      console.error("\nFixture control totals did not reproduce. No output was written.");
      for (const mismatch of mismatches) {
        console.error(`  ${mismatch.control}: expected ${mismatch.expected}, got ${mismatch.actual}`);
      }
      process.exit(1);
      return;
    }
  }

  const manifest = buildManifest(options, stats, checksum, content.byteLength, warnings);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const seedSql = buildSeedSql(rows, JSON.stringify(manifest), options.importedAt);

  mkdirSync(path.dirname(path.resolve(options.seedOut)), { recursive: true });
  mkdirSync(path.dirname(path.resolve(options.manifestOut)), { recursive: true });
  writeFileSync(path.resolve(options.seedOut), seedSql, "utf8");
  writeFileSync(path.resolve(options.manifestOut), `${manifestJson}\n`, "utf8");

  console.log("\nValidated dataset");
  console.log(`  rows / unique order ids     ${stats.rowCount} / ${stats.uniqueOrderIds}`);
  console.log(`  columns                     ${CSV_COLUMNS.length}`);
  console.log(
    `  order date range            ${stats.observedOrderDateMin} to ${stats.observedOrderDateMax}`,
  );
  console.log(`  latest delivery date        ${stats.observedDeliveryDateMax ?? "none"}`);
  console.log(
    `  delivered / delayed / exception   ${stats.statusCounts.delivered} / ${stats.statusCounts.delayed} / ${stats.statusCounts.exception}`,
  );
  console.log(
    `  in_transit / canceled       ${stats.statusCounts.in_transit} / ${stats.statusCounts.canceled}`,
  );
  console.log(
    `  dated / missing delivery    ${stats.datedDeliveryCount} / ${stats.missingDeliveryDateCount}`,
  );
  console.log(
    `  quantity / non-canceled     ${stats.totalQuantity} / ${stats.nonCanceledQuantity}`,
  );
  console.log(`  raw order value             USD ${formatCents(stats.rawOrderValueCents)}`);
  console.log(
    `  delayed or exception value  USD ${formatCents(stats.delayedOrExceptionValueCents)}`,
  );
  console.log(
    `  skus / categories / carriers ${stats.vocabulary.sku_count} / ${stats.vocabulary.product_categories.length} / ${stats.vocabulary.carriers.length}`,
  );
  console.log(
    `  clients / regions / warehouses ${stats.vocabulary.clients.length} / ${stats.vocabulary.regions.length} / ${stats.vocabulary.warehouses.length}`,
  );
  console.log(`  promo rows                  ${stats.promoRowCount}`);
  console.log(`  value mismatches            ${stats.valueMismatchCount}`);
  if (checksumMatches) {
    console.log("  fixture controls            reproduced from docs/data-audit.md");
  }
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const issue of warnings.slice(0, 10)) {
      console.log(`  line ${issue.line} field ${issue.field}: ${issue.message}`);
    }
    if (warnings.length > 10) console.log(`  ...and ${warnings.length - 10} more`);
  }

  console.log(`\nWrote ${options.seedOut}`);
  console.log(`Wrote ${options.manifestOut}`);
  console.log("\nApply locally with:");
  console.log("  npm run db:migrate");
  console.log("  npm run db:seed");
}

main();
