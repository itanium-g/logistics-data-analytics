import { describe, expect, it } from "vitest";
import {
  computeMetricValue,
  getMetric,
  listMetrics,
  metricAggregateParts,
  type MetricValue,
} from "../src/domain/metrics.ts";
import { METRIC_IDS, REQUIRED_KPI_METRICS, type MetricId } from "../src/shared/contracts.ts";
import { createTestDatabase, hasSuppliedCsv, type TestDatabase } from "./helpers/dataset.ts";

/**
 * Evaluate metrics directly against the seeded dataset. The bounded query
 * compiler arrives in the next step; this proves the registry's own SQL and
 * arithmetic first.
 */
async function evaluate(
  db: TestDatabase,
  ids: readonly MetricId[],
  where = "1 = 1",
): Promise<Readonly<Record<string, MetricValue>>> {
  const parts = ids.flatMap((id) => metricAggregateParts(id));
  const select = parts.map((part) => `${part.expression} AS ${part.alias}`).join(", ");
  const row = await db.first<Record<string, unknown>>(
    `SELECT ${select} FROM orders WHERE ${where}`,
  );
  const values: Record<string, MetricValue> = {};
  for (const id of ids) {
    values[id] = computeMetricValue(id, row ?? {});
  }
  return values;
}

describe("metric registry", () => {
  it("registers every contract metric with an honest label", () => {
    expect(listMetrics()).toHaveLength(METRIC_IDS.length);
    expect(getMetric("on_time_rate").label).toBe("On-time delivery rate (status proxy)");
    expect(getMetric("avg_delivery_days").label).toBe(
      "Average delivery time (delivery-status records)",
    );
    expect(getMetric("delayed_orders").label).toContain("status proxy");
  });

  it("attaches the status-proxy assumption to every rate and duration metric", () => {
    for (const id of ["on_time_rate", "delay_rate", "avg_delivery_days"] as const) {
      const text = getMetric(id).assumptions.join(" ");
      expect(text).toContain("no promised delivery date");
    }
  });

  it("documents that exceptions are excluded from rate denominators", () => {
    expect(getMetric("on_time_rate").assumptions.join(" ")).toContain("exception");
    expect(getMetric("on_time_rate").definition).toContain("delivered + delayed");
  });

  it("exposes the five required KPIs in display order", () => {
    expect(REQUIRED_KPI_METRICS).toEqual([
      "total_orders",
      "delivered_orders",
      "delayed_orders",
      "on_time_rate",
      "avg_delivery_days",
    ]);
  });
});

describe("metric arithmetic", () => {
  it("returns zero for empty counts and sums", () => {
    expect(computeMetricValue("total_orders", { total_orders__value: 0 }).value).toBe(0);
    expect(computeMetricValue("total_units", { total_units__value: null }).value).toBe(0);
  });

  it("returns null with an explanation when a ratio has no denominator", () => {
    const value = computeMetricValue("on_time_rate", {
      on_time_rate__num: 0,
      on_time_rate__den: 0,
    });
    expect(value.value).toBeNull();
    expect(value.denominator).toBe(0);
    expect(value.note).toContain("undefined rather than zero");
  });

  it("returns null with an explanation when an average has no eligible records", () => {
    const value = computeMetricValue("avg_delivery_days", {
      avg_delivery_days__total: 0,
      avg_delivery_days__eligible: 0,
    });
    expect(value.value).toBeNull();
    expect(value.eligible_count).toBe(0);
    expect(value.note).toContain("undefined");
  });

  it("always reports numerator and denominator for a ratio", () => {
    const value = computeMetricValue("delay_rate", {
      delay_rate__num: 2,
      delay_rate__den: 7,
    });
    expect(value.numerator).toBe(2);
    expect(value.denominator).toBe(7);
    expect(value.value).toBeCloseTo(2 / 7, 12);
  });
});

describe.skipIf(!hasSuppliedCsv)("metric values on the supplied fixture", () => {
  it("computes the five required KPIs exactly", async () => {
    const db = createTestDatabase();
    try {
      const values = await evaluate(db, REQUIRED_KPI_METRICS);

      expect(values["total_orders"]?.value).toBe(400);
      expect(values["delivered_orders"]?.value).toBe(304);
      expect(values["delayed_orders"]?.value).toBe(55);

      const onTime = values["on_time_rate"];
      expect(onTime?.numerator).toBe(304);
      expect(onTime?.denominator).toBe(359);
      expect(onTime?.value).toBe(304 / 359);
      // 84.6796657% as recorded in docs/data-audit.md.
      expect(((onTime?.value ?? 0) * 100).toFixed(7)).toBe("84.6796657");

      const avgDays = values["avg_delivery_days"];
      expect(avgDays?.eligible_count).toBe(359);
      expect(avgDays?.value).toBe(1324 / 359);
      expect((avgDays?.value ?? 0).toFixed(7)).toBe("3.6880223");
    } finally {
      db.close();
    }
  });

  it("computes the supporting metrics exactly", async () => {
    const db = createTestDatabase();
    try {
      const values = await evaluate(db, [
        "delay_rate",
        "exception_orders",
        "in_transit_orders",
        "canceled_orders",
        "total_units",
        "demand_units",
        "raw_order_value_cents",
        "delayed_exception_value_cents",
      ]);

      expect(values["delay_rate"]?.numerator).toBe(55);
      expect(values["delay_rate"]?.denominator).toBe(359);
      expect(((values["delay_rate"]?.value ?? 0) * 100).toFixed(7)).toBe("15.3203343");
      expect(values["exception_orders"]?.value).toBe(11);
      expect(values["in_transit_orders"]?.value).toBe(27);
      expect(values["canceled_orders"]?.value).toBe(3);
      expect(values["total_units"]?.value).toBe(1310);
      expect(values["demand_units"]?.value).toBe(1303);
      expect(values["raw_order_value_cents"]?.value).toBe(1_369_587);
      expect(values["delayed_exception_value_cents"]?.value).toBe(238_610);
    } finally {
      db.close();
    }
  });

  it("keeps the delivered-only mean available as a separately labelled fact", async () => {
    const db = createTestDatabase();
    try {
      const values = await evaluate(db, ["avg_delivery_days"], "status = 'delivered'");
      expect(values["avg_delivery_days"]?.eligible_count).toBe(304);
      expect(values["avg_delivery_days"]?.value).toBe(988 / 304);
      expect(values["avg_delivery_days"]?.value).toBeCloseTo(3.25, 10);

      // The exception-inclusive all-dated mean is a different quantity and is
      // deliberately not what avg_delivery_days reports under metric v2.
      const allDated = await db.first<{ total: number; n: number }>(
        "SELECT SUM(delivery_days) AS total, COUNT(delivery_days) AS n FROM orders",
      );
      expect(allDated).toEqual({ total: 1417, n: 370 });
      expect(1417 / 370).not.toBe(1324 / 359);
    } finally {
      db.close();
    }
  });

  it("returns null rates for a scope with no delivery outcome", async () => {
    const db = createTestDatabase();
    try {
      const values = await evaluate(
        db,
        ["on_time_rate", "avg_delivery_days", "total_orders"],
        "status = 'in_transit'",
      );
      expect(values["total_orders"]?.value).toBe(27);
      expect(values["on_time_rate"]?.value).toBeNull();
      expect(values["on_time_rate"]?.denominator).toBe(0);
      expect(values["avg_delivery_days"]?.value).toBeNull();
    } finally {
      db.close();
    }
  });

  it("returns zero counts and null rates for an empty scope", async () => {
    const db = createTestDatabase();
    try {
      const values = await evaluate(
        db,
        ["total_orders", "on_time_rate", "avg_delivery_days"],
        "order_date > '2030-01-01'",
      );
      expect(values["total_orders"]?.value).toBe(0);
      expect(values["on_time_rate"]?.value).toBeNull();
      expect(values["avg_delivery_days"]?.value).toBeNull();
    } finally {
      db.close();
    }
  });

  it("computes a carrier rate from aggregate counts, not a mean of rates", async () => {
    const db = createTestDatabase();
    try {
      const gls = await evaluate(db, ["delay_rate"], "carrier = 'GLS'");
      expect(gls["delay_rate"]?.numerator).toBe(2);
      expect(gls["delay_rate"]?.denominator).toBe(7);
      expect(((gls["delay_rate"]?.value ?? 0) * 100).toFixed(2)).toBe("28.57");

      // Averaging per-carrier percentages would produce a different number than
      // the aggregate ratio; the registry never does that.
      const carriers = await db.all<{ carrier: string; num: number; den: number }>(
        `SELECT carrier,
                SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) AS num,
                SUM(CASE WHEN status IN ('delivered', 'delayed') THEN 1 ELSE 0 END) AS den
         FROM orders GROUP BY carrier`,
      );
      const withDenominator = carriers.filter((row) => row.den > 0);
      const meanOfRates =
        withDenominator.reduce((sum, row) => sum + row.num / row.den, 0) /
        withDenominator.length;
      const aggregate =
        withDenominator.reduce((sum, row) => sum + row.num, 0) /
        withDenominator.reduce((sum, row) => sum + row.den, 0);
      expect(aggregate).toBeCloseTo(55 / 359, 12);
      expect(meanOfRates).not.toBeCloseTo(aggregate, 6);
    } finally {
      db.close();
    }
  });
});
