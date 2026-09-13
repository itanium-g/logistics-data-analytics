import { describe, expect, it } from "vitest";
import {
  addDays,
  compareIsoDates,
  daysBetween,
  isIsoDate,
  monthKey,
} from "../src/domain/dates.ts";
import { computeDatasetStats, validateHeader, validateRows } from "../src/data/import.ts";
import { MoneyParseError, formatCents, parseUsdToCents } from "../src/domain/money.ts";
import { SeedValueError, buildSeedSql, sqlText } from "../src/data/seed-sql.ts";
import { CSV_COLUMNS } from "../src/shared/dataset.ts";
import { SUPPLIED_FIXTURE_CONTROLS } from "../src/shared/fixture-controls.ts";
import {
  createTestDatabase,
  hasSuppliedCsv,
  suppliedRows,
  suppliedStats,
} from "./helpers/dataset.ts";

function baseRecord(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    client_id: "CL-1001",
    order_id: "ORD-2026-000001-0001",
    order_date: "2025-03-01",
    delivery_date: "2025-03-05",
    carrier: "DHL",
    origin_city: "Chicago, IL",
    destination_city: "Milwaukee, WI",
    status: "delivered",
    sku: "PAPER-0197",
    product_category: "PAPER",
    quantity: "2",
    unit_price_usd: "13.11",
    order_value_usd: "26.22",
    is_promo: "0",
    promo_discount_pct: "0",
    region: "US-C",
    warehouse: "CHI-DC1",
    ...overrides,
  };
}

describe("money parsing", () => {
  it("parses one and two decimal amounts into exact cents", () => {
    expect(parseUsdToCents("13.11")).toBe(1311);
    expect(parseUsdToCents("11.69")).toBe(1169);
    // 10.4 * 100 is 1040 exactly here; naive float multiplication of some
    // values (11.69 * 100 = 1168.9999999999998) would truncate to 1168.
    expect(parseUsdToCents("10.4")).toBe(1040);
    expect(parseUsdToCents("16.9")).toBe(1690);
    expect(parseUsdToCents("0")).toBe(0);
    expect(parseUsdToCents("0.05")).toBe(5);
    expect(parseUsdToCents(" 8.08 ")).toBe(808);
  });

  it("never loses a cent to floating point on the whole fixture range", () => {
    for (const raw of ["11.69", "8.69", "7.44", "21.28", "6.71", "62.4", "1.15", "2.29"]) {
      const cents = parseUsdToCents(raw);
      expect(formatCents(cents)).toBe(Number(raw).toFixed(2));
    }
  });

  it("rejects malformed or negative amounts instead of coercing them", () => {
    for (const raw of ["-1", "1.234", "", "abc", "1,000", ".5", "1.", "1e3", "NaN"]) {
      expect(() => parseUsdToCents(raw)).toThrow(MoneyParseError);
    }
  });

  it("formats cents back to a plain decimal string", () => {
    expect(formatCents(1_369_587)).toBe("13695.87");
    expect(formatCents(238_610)).toBe("2386.10");
    expect(formatCents(5)).toBe("0.05");
  });
});

describe("calendar dates", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isIsoDate("2025-01-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2025-02-30")).toBe(false);
    expect(isIsoDate("2025-13-01")).toBe(false);
    expect(isIsoDate("2025-1-1")).toBe(false);
    expect(isIsoDate("2025-01-01T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("counts whole calendar days without timezone drift", () => {
    expect(daysBetween("2025-01-22", "2025-01-26")).toBe(4);
    expect(daysBetween("2025-12-30", "2026-01-01")).toBe(2);
    expect(daysBetween("2025-03-01", "2025-03-01")).toBe(0);
    // Spans a northern-hemisphere daylight-saving transition.
    expect(daysBetween("2025-03-08", "2025-03-10")).toBe(2);
    expect(daysBetween("2025-03-05", "2025-03-01")).toBe(-4);
  });

  it("derives month keys and compares chronologically", () => {
    expect(monthKey("2025-04-18")).toBe("2025-04");
    expect(compareIsoDates("2025-01-01", "2025-12-31")).toBe(-1);
    expect(compareIsoDates("2025-12-31", "2025-12-31")).toBe(0);
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
  });
});

describe("header validation", () => {
  it("accepts the exact supplied column order", () => {
    expect(validateHeader([...CSV_COLUMNS])).toEqual([]);
  });

  it("reports a reordered column", () => {
    const reordered: string[] = [...CSV_COLUMNS];
    [reordered[2], reordered[3]] = [reordered[3] as string, reordered[2] as string];
    const issues = validateHeader(reordered);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.field).toBe("order_date");
  });

  it("reports a missing column", () => {
    const issues = validateHeader(CSV_COLUMNS.slice(0, 16));
    expect(issues.some((issue) => issue.message.includes("Expected 17 columns"))).toBe(true);
  });
});

describe("row validation", () => {
  it("accepts a well-formed row and derives delivery days", () => {
    const { rows, errors } = validateRows([baseRecord()]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.unit_price_cents).toBe(1311);
    expect(rows[0]?.order_value_cents).toBe(2622);
    expect(rows[0]?.delivery_days).toBe(4);
    expect(rows[0]?.delivery_date).toBe("2025-03-05");
  });

  it("treats an empty delivery date as null rather than an error", () => {
    const { rows, errors } = validateRows([
      baseRecord({ status: "in_transit", delivery_date: "" }),
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]?.delivery_date).toBeNull();
    expect(rows[0]?.delivery_days).toBeNull();
  });

  it("rejects a duplicate order id and reports the line", () => {
    const { rows, errors } = validateRows([baseRecord(), baseRecord()]);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3, field: "order_id" });
    expect(errors[0]?.message).toContain("Duplicate");
  });

  it("rejects an impossible date rather than repairing it", () => {
    const { rows, errors } = validateRows([baseRecord({ order_date: "2025-02-30" })]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatchObject({ line: 2, field: "order_date" });
  });

  it("rejects an unknown status", () => {
    const { rows, errors } = validateRows([baseRecord({ status: "lost" })]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatchObject({ field: "status" });
  });

  it("rejects non-positive or non-integer quantity", () => {
    for (const quantity of ["0", "-2", "2.5", ""]) {
      const { rows, errors } = validateRows([baseRecord({ quantity })]);
      expect(rows).toHaveLength(0);
      expect(errors.some((issue) => issue.field === "quantity")).toBe(true);
    }
  });

  it("rejects boolean spellings of is_promo, which the source encodes as 0 or 1", () => {
    const { rows, errors } = validateRows([baseRecord({ is_promo: "true" })]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatchObject({ field: "is_promo" });
  });

  it("rejects an order value that disagrees with quantity times unit price", () => {
    const { rows, errors } = validateRows([baseRecord({ order_value_usd: "26.23" })]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatchObject({ field: "order_value_usd" });
  });

  it("rejects a delivery date that precedes the order date", () => {
    const { rows, errors } = validateRows([
      baseRecord({ order_date: "2025-03-05", delivery_date: "2025-03-01" }),
    ]);
    expect(rows).toHaveLength(0);
    expect(errors[0]?.message).toContain("precedes order_date");
  });

  it("rejects an empty required identifier", () => {
    const { errors } = validateRows([baseRecord({ sku: "" })]);
    expect(errors[0]).toMatchObject({ field: "sku" });
  });

  it("warns without failing when status and delivery date disagree", () => {
    const missing = validateRows([baseRecord({ status: "delivered", delivery_date: "" })]);
    expect(missing.errors).toEqual([]);
    expect(missing.warnings[0]).toMatchObject({ field: "delivery_date" });

    const unexpected = validateRows([baseRecord({ status: "canceled" })]);
    expect(unexpected.errors).toEqual([]);
    expect(unexpected.warnings[0]?.message).toContain("does not establish delivery");
  });

  it("computes statistics that exclude canceled units from demand", () => {
    const stats = computeDatasetStats(
      validateRows([
        baseRecord({ order_id: "A-1", quantity: "3", order_value_usd: "39.33" }),
        baseRecord({
          order_id: "A-2",
          status: "canceled",
          delivery_date: "",
          quantity: "5",
          order_value_usd: "65.55",
        }),
      ]).rows,
    );
    expect(stats.totalQuantity).toBe(8);
    expect(stats.nonCanceledQuantity).toBe(3);
    expect(stats.statusCounts.canceled).toBe(1);
  });
});

describe("seed SQL generation", () => {
  it("escapes embedded single quotes", () => {
    expect(sqlText("O'Hare, IL")).toBe("'O''Hare, IL'");
  });

  it("refuses control characters instead of emitting a broken statement", () => {
    expect(() => sqlText("line1\nline2")).toThrow(SeedValueError);
    expect(() => sqlText("null\u0000byte")).toThrow(SeedValueError);
  });

  it("never touches the usage table, so reloading data cannot reset quota", () => {
    const sql = buildSeedSql(validateRows([baseRecord()]).rows, "{}", "2026-01-01T00:00:00.000Z");
    expect(sql).toContain("DELETE FROM orders;");
    expect(sql).toContain("DELETE FROM data_manifest;");
    expect(sql).not.toContain("llm_usage");
  });

  it("accepts a pretty-printed manifest by compacting it", () => {
    const pretty = JSON.stringify({ data_version: "1.0.0", nested: { a: 1 } }, null, 2);
    expect(pretty).toContain("\n");
    const sql = buildSeedSql([], pretty, "2026-01-01T00:00:00.000Z");
    expect(sql).toContain('{"data_version":"1.0.0","nested":{"a":1}}');
  });

  it("rejects a manifest that is not valid JSON", () => {
    expect(() => buildSeedSql([], "not json", "2026-01-01T00:00:00.000Z")).toThrow(SeedValueError);
  });
});

describe.skipIf(!hasSuppliedCsv)("supplied fixture", () => {
  const expected = SUPPLIED_FIXTURE_CONTROLS;

  it("validates every row with no errors", () => {
    expect(suppliedRows()).toHaveLength(expected.rowCount);
  });

  it("reproduces the audited control totals", () => {
    const stats = suppliedStats();
    expect(stats.rowCount).toBe(expected.rowCount);
    expect(stats.uniqueOrderIds).toBe(expected.uniqueOrderIds);
    expect(stats.observedOrderDateMin).toBe(expected.observedOrderDateMin);
    expect(stats.observedOrderDateMax).toBe(expected.observedOrderDateMax);
    expect(stats.observedDeliveryDateMax).toBe(expected.observedDeliveryDateMax);
    expect(stats.statusCounts).toEqual(expected.statusCounts);
    expect(stats.datedDeliveryCount).toBe(expected.datedDeliveryCount);
    expect(stats.missingDeliveryDateCount).toBe(expected.missingDeliveryDateCount);
    expect(stats.totalQuantity).toBe(expected.totalQuantity);
    expect(stats.nonCanceledQuantity).toBe(expected.nonCanceledQuantity);
    expect(stats.rawOrderValueCents).toBe(expected.rawOrderValueCents);
    expect(stats.delayedOrExceptionValueCents).toBe(expected.delayedOrExceptionValueCents);
    expect(stats.deliveryOutcomeCount).toBe(expected.deliveryOutcomeCount);
    expect(stats.deliveryOutcomeDaysTotal).toBe(expected.deliveryOutcomeDaysTotal);
    expect(stats.deliveredOnlyDaysTotal).toBe(expected.deliveredOnlyDaysTotal);
    expect(stats.allDatedDaysTotal).toBe(expected.allDatedDaysTotal);
    expect(stats.promoRowCount).toBe(expected.promoRowCount);
    expect(stats.valueMismatchCount).toBe(0);
    expect(stats.negativeDurationCount).toBe(0);
  });

  it("reproduces the monthly control table and sparsity profile", () => {
    const stats = suppliedStats();
    expect(stats.monthly).toEqual(expected.monthly);
    expect(stats.monthly.reduce((sum, month) => sum + month.orders, 0)).toBe(400);
    expect(stats.monthly.reduce((sum, month) => sum + month.nonCanceledUnits, 0)).toBe(1303);
    expect(stats.skuRowCountBuckets).toEqual(expected.skuRowCountBuckets);
    expect(stats.vocabulary.sku_count).toBe(expected.distinctSkus);
    expect(stats.vocabulary.product_categories).toHaveLength(expected.distinctCategories);
    expect(stats.vocabulary.carriers).toHaveLength(expected.distinctCarriers);
    expect(stats.vocabulary.clients).toHaveLength(expected.distinctClients);
    expect(stats.vocabulary.regions).toHaveLength(expected.distinctRegions);
    expect(stats.vocabulary.warehouses).toHaveLength(expected.distinctWarehouses);
  });

  it("parses cities that contain quoted commas", () => {
    const withCommas = suppliedRows().filter((row) => row.destination_city.includes(","));
    expect(withCommas.length).toBe(400);
    expect(suppliedRows()[0]?.destination_city).toBe("Leeds, UK");
  });

  it("loads the generated seed into a real SQL engine with identical totals", async () => {
    const db = createTestDatabase();
    try {
      const totals = await db.first<{
        orders: number;
        units: number;
        cents: number;
        dated: number;
      }>(
        "SELECT COUNT(*) AS orders, SUM(quantity) AS units, SUM(order_value_cents) AS cents, COUNT(delivery_date) AS dated FROM orders",
      );
      expect(totals).toEqual({
        orders: expected.rowCount,
        units: expected.totalQuantity,
        cents: expected.rawOrderValueCents,
        dated: expected.datedDeliveryCount,
      });

      const usage = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM llm_usage");
      expect(usage?.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it("carries the CRAYON-0008 forecast fixture rows", () => {
    const rows = suppliedRows().filter((row) => row.sku === "CRAYON-0008");
    expect(rows).toHaveLength(3);
    expect(
      rows.map((row) => ({ date: row.order_date, quantity: row.quantity, status: row.status })),
    ).toEqual([
      { date: "2025-01-22", quantity: 3, status: "delivered" },
      { date: "2025-04-18", quantity: 1, status: "delivered" },
      { date: "2025-01-14", quantity: 3, status: "delivered" },
    ]);
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(7);
  });
});
