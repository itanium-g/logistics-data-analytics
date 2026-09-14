import { describe, expect, it } from "vitest";
import { parseForecastRequest } from "../src/domain/forecast-schema.ts";
import type { ForecastResponse } from "../src/shared/contracts.ts";
import app from "../src/server/index.ts";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

async function postForecast(binding: TestBinding, body: unknown): Promise<Response> {
  return app.request(
    "/api/forecast",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { DB: binding.DB },
  );
}

async function forecast(binding: TestBinding, body: unknown): Promise<ForecastResponse> {
  const response = await postForecast(binding, body);
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as ForecastResponse;
}

describe("forecast request validation", () => {
  it("applies the documented defaults", () => {
    const parsed = parseForecastRequest({ sku: "CRAYON-0008" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({
      scope: "sku",
      sku: "CRAYON-0008",
      horizon_months: 4,
      buffer_pct: 20,
    });
  });

  it("rejects a horizon outside one to four months", () => {
    expect(parseForecastRequest({ sku: "A", horizon_months: 0 }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", horizon_months: 5 }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", horizon_months: 2.5 }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", horizon_months: "4" }).ok).toBe(false);
  });

  it("rejects a buffer outside nought to fifty percent", () => {
    expect(parseForecastRequest({ sku: "A", buffer_pct: -1 }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", buffer_pct: 51 }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", buffer_pct: 0 }).ok).toBe(true);
    expect(parseForecastRequest({ sku: "A", buffer_pct: 50 }).ok).toBe(true);
  });

  it("rejects unsupported scopes and unknown keys", () => {
    expect(parseForecastRequest({ scope: "category", sku: "CRAYON" }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", method: "arima" }).ok).toBe(false);
    expect(parseForecastRequest({ sku: "A", start_month: "2026-06" }).ok).toBe(false);
    expect(parseForecastRequest({}).ok).toBe(false);
  });
});

describe.skipIf(!hasSuppliedCsv)("POST /api/forecast", () => {
  it("reproduces the CRAYON-0008 acceptance example exactly", async () => {
    const binding = createTestBinding();
    try {
      const result = await forecast(binding, { sku: "CRAYON-0008" });

      // Recorded monthly series is [6, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0].
      expect(result.history).toHaveLength(12);
      expect(result.history.map((point) => point.units)).toEqual([
        6, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(result.history[0]?.month).toBe("2025-01");
      expect(result.history[11]?.month).toBe("2025-12");
      expect(result.sample).toEqual({ order_rows: 3, non_zero_months: 2, total_units: 7 });

      // Sparse branch: every SKU in this dataset has at most three rows.
      expect(result.method.id).toBe("sparse_12_month_mean");
      expect(result.monthly_forecast_units).toBe(7 / 12);

      // Four future months, January to April 2026.
      expect(result.forecast).toHaveLength(4);
      expect(result.forecast.map((point) => point.month)).toEqual([
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
      ]);
      for (const point of result.forecast) {
        expect(point.units).toBe(7 / 12);
        expect(point.kind).toBe("forecast");
      }

      // Four-month demand is 7/3 units; the 20% buffer gives ceil(2.8) = 3.
      expect(result.base_demand_units).toBeCloseTo(7 / 3, 12);
      expect(result.buffer_units).toBeCloseTo((7 / 3) * 0.2, 12);
      expect(result.coverage_target_units).toBe(3);

      expect(result.as_of_date).toBe("2025-12-31");
      expect(result.history_range).toEqual({ start: "2025-01-01", end: "2025-12-31" });
      expect(result.coverage_status).toBe("coverage_unverified");
      expect(result.units).toBe("units");
      expect(result.recommendation).toContain("Plan coverage for 3 units");
      expect(result.recommendation).toContain("Jan 2026 to Apr 2026");
      expect(result.recommendation).toContain("stock on hand and inbound supply");
    } finally {
      binding.close();
    }
  });

  it("rounds once after summing rather than once per month", async () => {
    const binding = createTestBinding();
    try {
      const result = await forecast(binding, { sku: "CRAYON-0008" });
      // Rounding each month first would give 4 x ceil(0.583) = 4 units, and
      // rounding each month up then buffering would give 5. The contract rounds
      // the buffered horizon total once, giving 3.
      expect(result.coverage_target_units).toBe(3);
      expect(Math.ceil(result.monthly_forecast_units) * result.horizon_months).toBe(4);
      expect(result.forecast.every((point) => !Number.isInteger(point.units))).toBe(true);
    } finally {
      binding.close();
    }
  });

  it("honours a shorter horizon and a different buffer", async () => {
    const binding = createTestBinding();
    try {
      const oneMonth = await forecast(binding, { sku: "CRAYON-0008", horizon_months: 1 });
      expect(oneMonth.forecast).toHaveLength(1);
      expect(oneMonth.forecast[0]?.month).toBe("2026-01");
      // ceil(0.5833 x 1.2) = 1
      expect(oneMonth.coverage_target_units).toBe(1);
      expect(oneMonth.recommendation).toContain("Jan 2026");

      const noBuffer = await forecast(binding, {
        sku: "CRAYON-0008",
        horizon_months: 4,
        buffer_pct: 0,
      });
      // ceil(7/3) = 3 as well, but the buffer contribution is zero.
      expect(noBuffer.buffer_units).toBe(0);
      expect(noBuffer.coverage_target_units).toBe(3);

      const bigBuffer = await forecast(binding, {
        sku: "CRAYON-0008",
        horizon_months: 4,
        buffer_pct: 50,
      });
      // ceil(2.3333 x 1.5) = ceil(3.5) = 4
      expect(bigBuffer.coverage_target_units).toBe(4);
    } finally {
      binding.close();
    }
  });

  it("warns about sparse history and states the as-of date", async () => {
    const binding = createTestBinding();
    try {
      const result = await forecast(binding, { sku: "CRAYON-0008" });
      const warnings = result.warnings.join(" ");
      expect(warnings).toContain("only 2 of 12 months");
      expect(warnings).toContain("illustrative baseline");
      expect(warnings).toContain("as of 2025-12-31");
      expect(warnings).toContain("not advice about the current date");
      expect(warnings).toContain("coverage_unverified");
    } finally {
      binding.close();
    }
  });

  it("states the inventory limitations rather than implying a purchase order", async () => {
    const binding = createTestBinding();
    try {
      const result = await forecast(binding, { sku: "CRAYON-0008" });
      const limitations = result.limitations.join(" ");
      expect(limitations).toContain("not a net purchase quantity");
      expect(limitations).toContain("lead times");
      expect(limitations).toContain("No confidence interval");
      expect(limitations).toContain("not a calibrated safety stock");
      expect(result.method.description).toContain("declared heuristic");
    } finally {
      binding.close();
    }
  });

  it("rejects an unknown SKU instead of inventing a number", async () => {
    const binding = createTestBinding();
    try {
      const response = await postForecast(binding, { sku: "CRAYON-9999" });
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error: { code: string; message: string; details?: { path: string }[] };
      };
      expect(body.error.code).toBe("unknown_value");
      expect(body.error.message).toContain("No orders exist for SKU");
      expect(body.error.details?.[0]?.path).toBe("sku");
    } finally {
      binding.close();
    }
  });

  it("excludes canceled units from demand", async () => {
    const binding = createTestBinding();
    try {
      // Pick a SKU whose only rows are canceled: force one for this check.
      binding.raw.exec(
        "UPDATE orders SET status = 'canceled', delivery_date = NULL, delivery_days = NULL WHERE sku = 'CRAYON-0008'",
      );
      const result = await forecast(binding, { sku: "CRAYON-0008" });
      expect(result.sample.total_units).toBe(0);
      expect(result.sample.non_zero_months).toBe(0);
      expect(result.monthly_forecast_units).toBe(0);
      expect(result.base_demand_units).toBe(0);
      expect(result.coverage_target_units).toBe(0);
      expect(result.warnings.join(" ")).toContain("recorded no non-canceled units");
    } finally {
      binding.close();
    }
  });

  it("uses the trailing method only when at least six months recorded demand", async () => {
    const binding = createTestBinding();
    try {
      // Every SKU in the supplied fixture is sparse.
      const sparse = await forecast(binding, { sku: "CRAYON-0008" });
      expect(sparse.method.id).toBe("sparse_12_month_mean");

      // Give one SKU demand in eight distinct months to exercise the other branch.
      const months = [
        "2025-05-05",
        "2025-06-05",
        "2025-07-05",
        "2025-08-05",
        "2025-09-05",
        "2025-10-05",
        "2025-11-05",
        "2025-12-05",
      ];
      months.forEach((date, index) => {
        binding.raw
          .prepare(
            `INSERT INTO orders (order_id, client_id, order_date, delivery_date, carrier,
              origin_city, destination_city, status, sku, product_category, quantity,
              unit_price_cents, order_value_cents, is_promo, promo_discount_pct, region,
              warehouse, delivery_days)
             VALUES (?, 'CL-1001', ?, NULL, 'DHL', 'Chicago, IL', 'Detroit, MI', 'in_transit',
                     'DENSE-0001', 'CRAYON', ?, 100, ?, 0, 0, 'US-C', 'CHI-DC1', NULL)`,
          )
          .run(`SYN-${index}`, date, 2, 200);
      });

      const dense = await forecast(binding, { sku: "DENSE-0001" });
      expect(dense.sample.non_zero_months).toBe(8);
      expect(dense.method.id).toBe("trailing_3_month_mean");
      // Last three months each recorded 2 units.
      expect(dense.monthly_forecast_units).toBe(2);
      expect(dense.base_demand_units).toBe(8);
      // ceil(8 x 1.2) = 10
      expect(dense.coverage_target_units).toBe(10);
      expect(dense.warnings.join(" ")).not.toContain("illustrative baseline");
    } finally {
      binding.close();
    }
  });

  it("rejects a non-JSON or oversized forecast body", async () => {
    const binding = createTestBinding();
    try {
      const wrongType = await app.request(
        "/api/forecast",
        { method: "POST", headers: { "Content-Type": "text/plain" }, body: "sku" },
        { DB: binding.DB },
      );
      expect(wrongType.status).toBe(400);

      const injected = await postForecast(binding, {
        sku: "CRAYON-0008'; DROP TABLE orders; --",
      });
      expect(injected.status).toBe(400);
      const body = (await injected.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unknown_value");

      // The table survived the rejected request.
      const check = await forecast(binding, { sku: "CRAYON-0008" });
      expect(check.sample.total_units).toBe(7);
    } finally {
      binding.close();
    }
  });
});
