import { describe, expect, it } from "vitest";
import {
  addMonths,
  endOfMonth,
  monthKeysBetween,
  startOfMonth,
  startOfWeekMonday,
} from "../src/domain/dates.ts";
import {
  DateScopeError,
  dateScopeWarnings,
  resolveDateScope,
  utcToday,
} from "../src/domain/date-context.ts";
import app from "../src/worker/index.ts";
import type { MetaResponse } from "../src/shared/contracts.ts";
import { createTestBinding, hasSuppliedCsv } from "./helpers/dataset.ts";

/** Fixed instants so tests never depend on the wall clock. */
const SEPTEMBER_2026 = new Date("2026-09-13T02:30:00.000Z");
const JANUARY_2026 = new Date("2026-01-15T12:00:00.000Z");

describe("month and week calendar helpers", () => {
  it("finds month boundaries including leap February", () => {
    expect(startOfMonth("2025-04-18")).toBe("2025-04-01");
    expect(endOfMonth("2025-04-18")).toBe("2025-04-30");
    expect(endOfMonth("2025-02-10")).toBe("2025-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2025-12-01")).toBe("2025-12-31");
  });

  it("shifts months without overflowing into the wrong month", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2025-12-15", 1)).toBe("2026-01-15");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2025-12-01", -11)).toBe("2025-01-01");
  });

  it("uses Monday week starts", () => {
    expect(startOfWeekMonday("2025-01-06")).toBe("2025-01-06");
    expect(startOfWeekMonday("2025-01-05")).toBe("2024-12-30");
    expect(startOfWeekMonday("2025-01-01")).toBe("2024-12-30");
    expect(startOfWeekMonday("2025-10-01")).toBe("2025-09-29");
  });

  it("enumerates inclusive month keys", () => {
    expect(monthKeysBetween("2025-01-01", "2025-12-31")).toHaveLength(12);
    expect(monthKeysBetween("2025-10-05", "2025-12-31")).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
    expect(monthKeysBetween("2026-01-01", "2026-04-30")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });
});

describe("dataset date mode", () => {
  const base = { date_field: "order_date", date_context: "dataset" } as const;

  it('resolves "last month" to December 2025 regardless of the real clock', () => {
    for (const now of [SEPTEMBER_2026, JANUARY_2026]) {
      const scope = resolveDateScope({ ...base, relative_range: "last_month" }, now);
      expect(scope.reference_date).toBe("2026-01-01");
      expect(scope.from).toBe("2025-12-01");
      expect(scope.to).toBe("2025-12-31");
      expect(scope.basis).toContain("Last complete calendar month");
    }
  });

  it('resolves "last 3 months" to October through December 2025', () => {
    const scope = resolveDateScope({ ...base, relative_range: "last_3_months" }, SEPTEMBER_2026);
    expect(scope.from).toBe("2025-10-01");
    expect(scope.to).toBe("2025-12-31");
  });

  it("resolves the twelve-month window to the full assumed coverage", () => {
    const scope = resolveDateScope({ ...base, relative_range: "last_12_months" }, SEPTEMBER_2026);
    expect(scope.from).toBe("2025-01-01");
    expect(scope.to).toBe("2025-12-31");
  });

  it("leaves an all-time scope unbounded", () => {
    const scope = resolveDateScope({ ...base, relative_range: "all_time" }, SEPTEMBER_2026);
    expect(scope.from).toBeNull();
    expect(scope.to).toBeNull();
  });
});

describe("current date mode", () => {
  const base = { date_field: "order_date", date_context: "current" } as const;

  it("uses the real UTC month and does not shift into the dataset", () => {
    const scope = resolveDateScope({ ...base, relative_range: "last_month" }, SEPTEMBER_2026);
    expect(scope.reference_date).toBe("2026-09-13");
    expect(scope.from).toBe("2026-08-01");
    expect(scope.to).toBe("2026-08-31");
  });

  it("warns that a range outside coverage is legitimately empty", () => {
    const scope = resolveDateScope({ ...base, relative_range: "last_month" }, SEPTEMBER_2026);
    const warnings = dateScopeWarnings(scope);
    expect(warnings.some((text) => text.includes("entirely outside the assumed data coverage"))).toBe(
      true,
    );
    expect(warnings.some((text) => text.includes("was not shifted"))).toBe(true);
  });

  it("derives today's date from UTC, not local time", () => {
    // 02:30 UTC+7 on the 13th is still the 13th in UTC here; the point is that
    // the conversion is explicit rather than locale dependent.
    expect(utcToday(new Date("2026-09-13T02:30:00.000Z"))).toBe("2026-09-13");
    expect(utcToday(new Date("2026-09-13T23:59:59.000Z"))).toBe("2026-09-13");
    expect(utcToday(new Date("2026-09-14T00:00:00.000Z"))).toBe("2026-09-14");
  });
});

describe("explicit date bounds", () => {
  const base = { date_field: "order_date", date_context: "dataset" } as const;

  it("passes real inclusive bounds through unchanged", () => {
    const scope = resolveDateScope(
      { ...base, date_from: "2025-10-01", date_to: "2025-12-31" },
      SEPTEMBER_2026,
    );
    expect(scope.from).toBe("2025-10-01");
    expect(scope.to).toBe("2025-12-31");
    expect(scope.relative_range).toBeNull();
    expect(scope.basis).toContain("Explicit inclusive bounds");
  });

  it("rejects supplying both explicit bounds and a relative range", () => {
    expect(() =>
      resolveDateScope(
        { ...base, date_from: "2025-10-01", date_to: "2025-12-31", relative_range: "last_month" },
        SEPTEMBER_2026,
      ),
    ).toThrow(DateScopeError);
  });

  it("rejects a single open bound", () => {
    expect(() => resolveDateScope({ ...base, date_from: "2025-10-01" }, SEPTEMBER_2026)).toThrow(
      /both be supplied or both omitted/,
    );
  });

  it("rejects an inverted range", () => {
    expect(() =>
      resolveDateScope({ ...base, date_from: "2025-12-31", date_to: "2025-10-01" }, SEPTEMBER_2026),
    ).toThrow(/must not be later than/);
  });

  it("rejects impossible calendar dates", () => {
    expect(() =>
      resolveDateScope({ ...base, date_from: "2025-02-30", date_to: "2025-03-01" }, SEPTEMBER_2026),
    ).toThrow(DateScopeError);
  });

  it("warns when the delivery-date basis excludes undated records", () => {
    const scope = resolveDateScope(
      {
        date_field: "delivery_date",
        date_context: "dataset",
        date_from: "2025-12-01",
        date_to: "2025-12-31",
      },
      SEPTEMBER_2026,
    );
    expect(dateScopeWarnings(scope).some((text) => text.includes("delivery_date excludes"))).toBe(
      true,
    );
  });
});

describe.skipIf(!hasSuppliedCsv)("GET /api/meta", () => {
  it("returns metric definitions, vocabulary and coverage from the manifest", async () => {
    const binding = createTestBinding();
    try {
      const response = await app.request("/api/meta", {}, { DB: binding.DB });
      expect(response.status).toBe(200);
      const body = (await response.json()) as MetaResponse;

      expect(body.data_version).toBe("1.0.0");
      expect(body.metric_version).toBe("2");
      expect(body.source.checksum_matches_supplied_fixture).toBe(true);
      expect(body.observed.row_count).toBe(400);
      expect(body.observed.order_date_min).toBe("2025-01-01");
      expect(body.observed.order_date_max).toBe("2025-12-30");
      expect(body.assumed_coverage).toMatchObject({
        start: "2025-01-01",
        end: "2025-12-31",
        status: "coverage_unverified",
      });
      expect(body.dataset_reference_date).toBe("2026-01-01");

      expect(body.required_kpi_metrics).toEqual([
        "total_orders",
        "delivered_orders",
        "delayed_orders",
        "on_time_rate",
        "avg_delivery_days",
      ]);
      const onTime = body.metrics.find((metric) => metric.id === "on_time_rate");
      expect(onTime?.label).toBe("On-time delivery rate (status proxy)");
      expect(onTime?.unit).toBe("fraction");

      expect(body.vocabulary.carriers).toHaveLength(9);
      expect(body.vocabulary.carriers).toContain("GLS");
      expect(body.vocabulary.regions).toHaveLength(5);
      expect(body.vocabulary.statuses).toHaveLength(5);
      expect(body.vocabulary.sku_count).toBe(355);

      expect(body.limits).toMatchObject({
        max_metrics: 3,
        max_filters: 5,
        max_filter_values: 20,
        max_row_limit: 100,
        default_row_limit: 20,
      });
      expect(body.assumptions.join(" ")).toContain("on-time proxy");
    } finally {
      binding.close();
    }
  });

  it("reports a clear unavailable state when no data has been imported", async () => {
    const binding = createTestBinding([]);
    try {
      binding.raw.exec("DELETE FROM data_manifest");
      const response = await app.request("/api/meta", {}, { DB: binding.DB });
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("data_unavailable");
      expect(body.error.message).toContain("importer");
    } finally {
      binding.close();
    }
  });
});
