import { describe, expect, it } from "vitest";
import { selectChart } from "../src/domain/chart.ts";
import { parseQueryRequest, type QueryRequestInput } from "../src/domain/query-schema.ts";
import type { QueryResponse } from "../src/shared/contracts.ts";
import app from "../src/server/index.ts";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

async function postQuery(
  binding: TestBinding,
  body: unknown,
  init: RequestInit = {},
): Promise<Response> {
  return app.request(
    "/api/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      body: JSON.stringify(body),
      ...init,
    },
    { DB: binding.DB },
  );
}

async function query(binding: TestBinding, body: QueryRequestInput): Promise<QueryResponse> {
  const response = await postQuery(binding, body);
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as QueryResponse;
}

function valueOf(response: QueryResponse, metric: string, rowIndex = 0): number | null {
  const row = response.rows[rowIndex];
  return row?.metrics.find((entry) => entry.metric === metric)?.value ?? null;
}

describe("request validation", () => {
  it("applies documented defaults", () => {
    const parsed = parseQueryRequest({ metrics: ["total_orders"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      time_grain: "none",
      date_field: "order_date",
      date_context: "dataset",
      order_dir: "desc",
      limit: 20,
      filters: [],
    });
  });

  it("rejects unknown keys instead of ignoring them", () => {
    const parsed = parseQueryRequest({ metrics: ["total_orders"], sql: "SELECT 1" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown metrics, dimensions and grains", () => {
    expect(parseQueryRequest({ metrics: ["revenue_growth"] }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], breakdown: "courier" }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], time_grain: "hour" }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], date_field: "shipped_at" }).ok).toBe(
      false,
    );
  });

  it("rejects wrong primitive types", () => {
    expect(parseQueryRequest({ metrics: "total_orders" }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], limit: "20" }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], limit: 20.5 }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], filters: {} }).ok).toBe(false);
  });

  it("enforces the documented bounds", () => {
    expect(parseQueryRequest({ metrics: [] }).ok).toBe(false);
    expect(
      parseQueryRequest({
        metrics: ["total_orders", "delivered_orders", "delayed_orders", "on_time_rate"],
      }).ok,
    ).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], limit: 0 }).ok).toBe(false);
    expect(parseQueryRequest({ metrics: ["total_orders"], limit: 101 }).ok).toBe(false);
    expect(
      parseQueryRequest({
        metrics: ["total_orders"],
        filters: Array.from({ length: 6 }, () => ({
          field: "carrier",
          op: "eq",
          values: ["DHL"],
        })),
      }).ok,
    ).toBe(false);
    expect(
      parseQueryRequest({
        metrics: ["total_orders"],
        filters: [
          { field: "carrier", op: "in", values: Array.from({ length: 21 }, (_, i) => `C${i}`) },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate metrics and duplicate filter fields", () => {
    expect(parseQueryRequest({ metrics: ["total_orders", "total_orders"] }).ok).toBe(false);
    expect(
      parseQueryRequest({
        metrics: ["total_orders"],
        filters: [
          { field: "carrier", op: "eq", values: ["DHL"] },
          { field: "carrier", op: "eq", values: ["UPS"] },
        ],
      }).ok,
    ).toBe(false);
  });

  it("requires eq to carry exactly one value", () => {
    expect(
      parseQueryRequest({
        metrics: ["total_orders"],
        filters: [{ field: "carrier", op: "eq", values: ["DHL", "UPS"] }],
      }).ok,
    ).toBe(false);
  });

  it("requires order_by to be a requested metric", () => {
    expect(
      parseQueryRequest({
        metrics: ["total_orders"],
        breakdown: "carrier",
        order_by: "delay_rate",
      }).ok,
    ).toBe(false);
  });
});

describe("chart selection", () => {
  const base = {
    metrics: ["total_orders"],
    breakdown: null,
    time_grain: "none",
    date_field: "order_date",
    date_context: "dataset",
    relative_range: null,
    date_from: null,
    date_to: null,
    filters: [],
    order_by: null,
    order_dir: "desc",
    limit: 20,
  } as const;

  it("chooses a line for a time series", () => {
    expect(selectChart({ ...base, time_grain: "month" }).hint).toBe("line");
    expect(selectChart({ ...base, time_grain: "week" }).x_label).toContain("Monday");
  });

  it("chooses a bar for a dimension breakdown", () => {
    const spec = selectChart({ ...base, breakdown: "carrier" });
    expect(spec.hint).toBe("bar");
    expect(spec.y_label).toBe("Carrier");
  });

  it("chooses a scalar card for a single value", () => {
    expect(selectChart(base).hint).toBe("scalar");
  });
});

describe.skipIf(!hasSuppliedCsv)("POST /api/query", () => {
  it("returns the five KPIs over the whole dataset with echoed scope", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["total_orders", "delivered_orders", "delayed_orders"],
        relative_range: "all_time",
      });
      expect(valueOf(result, "total_orders")).toBe(400);
      expect(valueOf(result, "delivered_orders")).toBe(304);
      expect(valueOf(result, "delayed_orders")).toBe(55);
      expect(result.scope.date_field).toBe("order_date");
      expect(result.scope.date_context).toBe("dataset");
      expect(result.scope.reference_date).toBe("2026-01-01");
      expect(result.chart.hint).toBe("scalar");
      expect(result.metric_version).toBe("2");
      expect(result.scope_row_count).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("answers the delayed-by-week example with Monday weeks summing to 10", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["delayed_orders"],
        time_grain: "week",
        relative_range: "last_3_months",
      });

      expect(result.scope.from).toBe("2025-10-01");
      expect(result.scope.to).toBe("2025-12-31");
      expect(result.chart.hint).toBe("line");

      const total = result.rows.reduce(
        (sum, row) => sum + (row.metrics[0]?.value ?? 0),
        0,
      );
      expect(total).toBe(10);

      // A boundary week legitimately starts before the requested from-date; the
      // requested bounds are still reported unchanged.
      const keys = result.rows.map((row) => row.key);
      expect(keys).toEqual([...keys].sort());
      expect(keys.some((key) => key !== null && key < "2025-10-01")).toBe(true);
    } finally {
      binding.close();
    }
  });

  it("ranks carrier delay rate with GLS first and its denominator visible", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["delay_rate", "total_orders"],
        breakdown: "carrier",
        order_by: "delay_rate",
        order_dir: "desc",
        relative_range: "all_time",
      });

      expect(result.chart.hint).toBe("bar");
      const top = result.rows[0];
      expect(top?.key).toBe("GLS");
      const rate = top?.metrics.find((metric) => metric.metric === "delay_rate");
      expect(rate?.numerator).toBe(2);
      expect(rate?.denominator).toBe(7);
      expect(((rate?.value ?? 0) * 100).toFixed(2)).toBe("28.57");
      expect(result.total_groups).toBe(9);
      expect(result.warnings.join(" ")).toContain("fewer than ten records");

      // Aggregate summary is computed over the whole scope, not from the shown rows.
      const summaryRate = result.summary.find((metric) => metric.metric === "delay_rate");
      expect(summaryRate?.numerator).toBe(55);
      expect(summaryRate?.denominator).toBe(359);
    } finally {
      binding.close();
    }
  });

  it("distinguishes the delivery-event cohort from the order cohort", async () => {
    const binding = createTestBinding();
    try {
      const byDelivery = await query(binding, {
        metrics: ["total_orders"],
        date_field: "delivery_date",
        relative_range: "last_month",
        filters: [{ field: "status", op: "eq", values: ["delayed"] }],
      });
      expect(byDelivery.scope.from).toBe("2025-12-01");
      expect(byDelivery.scope.to).toBe("2025-12-31");
      expect(valueOf(byDelivery, "total_orders")).toBe(4);
      expect(byDelivery.warnings.join(" ")).toContain("delivery_date excludes");

      const byOrder = await query(binding, {
        metrics: ["total_orders"],
        date_field: "order_date",
        relative_range: "last_month",
        filters: [{ field: "status", op: "eq", values: ["delayed"] }],
      });
      expect(valueOf(byOrder, "total_orders")).toBe(3);
    } finally {
      binding.close();
    }
  });

  it("counts the October to December delayed order cohort as 10", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["delayed_orders"],
        relative_range: "last_3_months",
      });
      expect(valueOf(result, "delayed_orders")).toBe(10);
    } finally {
      binding.close();
    }
  });

  it("returns monthly order volume for the dashboard chart", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["total_orders"],
        time_grain: "month",
        relative_range: "last_12_months",
        limit: 100,
      });
      expect(result.rows).toHaveLength(12);
      expect(result.rows[0]?.key).toBe("2025-01");
      expect(result.rows[0]?.metrics[0]?.value).toBe(75);
      expect(result.rows[11]?.key).toBe("2025-12");
      expect(result.rows[11]?.metrics[0]?.value).toBe(24);
      expect(
        result.rows.reduce((sum, row) => sum + (row.metrics[0]?.value ?? 0), 0),
      ).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("returns all five status counts for the dashboard chart", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["total_orders"],
        breakdown: "status",
        relative_range: "all_time",
        limit: 100,
      });
      expect(result.total_groups).toBe(5);
      const counts = Object.fromEntries(
        result.rows.map((row) => [row.key, row.metrics[0]?.value]),
      );
      expect(counts).toEqual({
        delivered: 304,
        delayed: 55,
        in_transit: 27,
        exception: 11,
        canceled: 3,
      });
    } finally {
      binding.close();
    }
  });

  it("truncates after ranking the full scope and says so", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["total_orders"],
        breakdown: "carrier",
        order_by: "total_orders",
        limit: 3,
        relative_range: "all_time",
      });
      expect(result.total_groups).toBe(9);
      expect(result.returned_groups).toBe(3);
      expect(result.truncated).toBe(true);
      expect(result.warnings.join(" ")).toContain("9 groups matched");
      const values = result.rows.map((row) => row.metrics[0]?.value ?? 0);
      expect(values).toEqual([...values].sort((a, b) => b - a));
      // The summary still covers every record, not just the three shown.
      expect(result.summary[0]?.value).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("orders undefined rates last rather than treating them as zero", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["on_time_rate"],
        breakdown: "status",
        order_by: "on_time_rate",
        order_dir: "desc",
        relative_range: "all_time",
        limit: 100,
      });
      const lastRows = result.rows.slice(-3);
      expect(lastRows.every((row) => row.metrics[0]?.value === null)).toBe(true);
      expect(result.rows[0]?.key).toBe("delivered");
      for (const row of lastRows) {
        expect(row.metrics[0]?.note).toContain("undefined rather than zero");
      }
    } finally {
      binding.close();
    }
  });

  it("returns zero counts and null rates for an out-of-coverage range", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["total_orders", "on_time_rate"],
        date_from: "2026-08-01",
        date_to: "2026-08-31",
      });
      expect(valueOf(result, "total_orders")).toBe(0);
      expect(valueOf(result, "on_time_rate")).toBeNull();
      expect(result.scope.from).toBe("2026-08-01");
      expect(result.warnings.join(" ")).toContain("entirely outside the assumed data coverage");
      expect(result.warnings.join(" ")).toContain("No records match this scope");
    } finally {
      binding.close();
    }
  });

  it("reports the assumptions behind proxy metrics", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["on_time_rate"],
        relative_range: "all_time",
      });
      expect(result.assumptions.join(" ")).toContain("no promised delivery date");
      expect(result.assumptions.join(" ")).toContain("exception");
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("query safety", () => {
  it("cannot be used to inject SQL through a filter value", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(binding, {
        metrics: ["total_orders"],
        filters: [
          { field: "carrier", op: "eq", values: ["DHL'; DROP TABLE orders; --"] },
        ],
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("unknown_value");

      // The table is still intact and untouched.
      const check = await query(binding, {
        metrics: ["total_orders"],
        relative_range: "all_time",
      });
      expect(valueOf(check, "total_orders")).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("cannot be used to inject SQL through a metric or dimension name", async () => {
    const binding = createTestBinding();
    try {
      for (const body of [
        { metrics: ["total_orders); DROP TABLE orders; --"] },
        { metrics: ["total_orders"], breakdown: "carrier); DELETE FROM orders; --" },
        { metrics: ["total_orders"], time_grain: "month'; DROP TABLE orders; --" },
      ]) {
        const response = await postQuery(binding, body);
        expect(response.status).toBe(400);
      }
      const check = await query(binding, {
        metrics: ["total_orders"],
        relative_range: "all_time",
      });
      expect(valueOf(check, "total_orders")).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("rejects a combined trend and breakdown, asking the caller to choose", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(binding, {
        metrics: ["total_orders"],
        time_grain: "month",
        breakdown: "carrier",
      });
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("unsupported");
      expect(body.error.message).toContain("Ask for either the trend or the breakdown");
    } finally {
      binding.close();
    }
  });

  it("rejects ranking a time series", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(binding, {
        metrics: ["total_orders"],
        time_grain: "month",
        order_by: "total_orders",
      });
      expect(response.status).toBe(422);
    } finally {
      binding.close();
    }
  });

  it("rejects an inverted or impossible explicit range with a field path", async () => {
    const binding = createTestBinding();
    try {
      const inverted = await postQuery(binding, {
        metrics: ["total_orders"],
        date_from: "2025-12-31",
        date_to: "2025-10-01",
      });
      expect(inverted.status).toBe(400);
      const body = (await inverted.json()) as {
        error: { code: string; details?: { path: string }[] };
      };
      expect(body.error.code).toBe("bad_input");
      expect(body.error.details?.[0]?.path).toBe("date_from");

      const impossible = await postQuery(binding, {
        metrics: ["total_orders"],
        date_from: "2025-02-30",
        date_to: "2025-03-01",
      });
      expect(impossible.status).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("rejects both explicit bounds and a relative range together", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(binding, {
        metrics: ["total_orders"],
        date_from: "2025-10-01",
        date_to: "2025-12-31",
        relative_range: "last_month",
      });
      expect(response.status).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("rejects a non-JSON body, an empty body and an oversized body", async () => {
    const binding = createTestBinding();
    try {
      const wrongType = await app.request(
        "/api/query",
        { method: "POST", headers: { "Content-Type": "text/plain" }, body: "metrics" },
        { DB: binding.DB },
      );
      expect(wrongType.status).toBe(400);

      const empty = await app.request(
        "/api/query",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "" },
        { DB: binding.DB },
      );
      expect(empty.status).toBe(400);

      const oversized = await app.request(
        "/api/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics: ["total_orders"], pad: "x".repeat(17_000) }),
        },
        { DB: binding.DB },
      );
      expect(oversized.status).toBe(400);
      const body = (await oversized.json()) as { error: { message: string } };
      expect(body.error.message).toContain("byte limit");
    } finally {
      binding.close();
    }
  });

  it("rejects a cross-origin browser POST", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(
        binding,
        { metrics: ["total_orders"] },
        { headers: { Origin: "https://evil.example" } },
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toContain("Cross-origin");
    } finally {
      binding.close();
    }
  });

  it("rejects an unknown filter value with a helpful message", async () => {
    const binding = createTestBinding();
    try {
      const response = await postQuery(binding, {
        metrics: ["total_orders"],
        filters: [{ field: "carrier", op: "eq", values: ["Pigeon Post"] }],
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("unknown_value");
      expect(body.error.message).toContain("Known values include");

      const unknownSku = await postQuery(binding, {
        metrics: ["total_orders"],
        filters: [{ field: "sku", op: "eq", values: ["NOT-A-SKU-9999"] }],
      });
      expect(unknownSku.status).toBe(400);
      const skuBody = (await unknownSku.json()) as { error: { code: string } };
      expect(skuBody.error.code).toBe("unknown_value");
    } finally {
      binding.close();
    }
  });

  it("accepts a known SKU filter", async () => {
    const binding = createTestBinding();
    try {
      const result = await query(binding, {
        metrics: ["demand_units", "total_orders"],
        filters: [{ field: "sku", op: "eq", values: ["CRAYON-0008"] }],
        relative_range: "all_time",
      });
      expect(valueOf(result, "total_orders")).toBe(3);
      expect(valueOf(result, "demand_units")).toBe(7);
    } finally {
      binding.close();
    }
  });
});
