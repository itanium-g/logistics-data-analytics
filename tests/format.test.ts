import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  axisSuffix,
  chartValue,
  describeMetricBasis,
  describeScope,
  formatGroupLabel,
  formatIsoDate,
  formatMetricValue,
  formatMonthKey,
} from "../src/domain/format.ts";
import type { MetricValue, ResolvedScope } from "../src/shared/contracts.ts";

function metric(overrides: Partial<MetricValue> & Pick<MetricValue, "unit" | "value">): MetricValue {
  return {
    metric: "total_orders",
    label: "Total orders",
    ...overrides,
  } as MetricValue;
}

describe("metric formatting", () => {
  it("formats counts and units with digit grouping", () => {
    expect(formatMetricValue(metric({ unit: "orders", value: 400 }))).toBe("400");
    expect(formatMetricValue(metric({ unit: "units", value: 1310 }))).toBe("1,310");
    expect(formatMetricValue(metric({ unit: "orders", value: 0 }))).toBe("0");
    expect(formatMetricValue(metric({ unit: "units", value: 1_234_567 }))).toBe("1,234,567");
  });

  it("formats a fraction as a percentage with two decimals", () => {
    expect(formatMetricValue(metric({ unit: "fraction", value: 304 / 359 }))).toBe("84.68%");
    expect(formatMetricValue(metric({ unit: "fraction", value: 55 / 359 }))).toBe("15.32%");
    expect(formatMetricValue(metric({ unit: "fraction", value: 2 / 7 }))).toBe("28.57%");
    expect(formatMetricValue(metric({ unit: "fraction", value: 0 }))).toBe("0.00%");
  });

  it("formats durations in days", () => {
    expect(formatMetricValue(metric({ unit: "days", value: 1324 / 359 }))).toBe("3.69 days");
    expect(formatMetricValue(metric({ unit: "days", value: 3.25 }))).toBe("3.25 days");
  });

  it("formats cents as grouped USD", () => {
    expect(formatMetricValue(metric({ unit: "cents", value: 1_369_587 }))).toBe("USD 13,695.87");
    expect(formatMetricValue(metric({ unit: "cents", value: 238_610 }))).toBe("USD 2,386.10");
    expect(formatMetricValue(metric({ unit: "cents", value: 5 }))).toBe("USD 0.05");
  });

  it("renders an undefined value as N/A rather than zero", () => {
    expect(formatMetricValue(metric({ unit: "fraction", value: null }))).toBe(NOT_AVAILABLE);
    expect(formatMetricValue(metric({ unit: "days", value: null }))).toBe(NOT_AVAILABLE);
  });
});

describe("metric basis description", () => {
  it("shows both components of a ratio", () => {
    expect(
      describeMetricBasis(
        metric({ unit: "fraction", value: 304 / 359, numerator: 304, denominator: 359 }),
      ),
    ).toBe("304 of 359 records");
  });

  it("shows the eligible count of an average", () => {
    expect(
      describeMetricBasis(metric({ unit: "days", value: 3.69, eligible_count: 359 })),
    ).toBe("359 eligible records");
  });

  it("explains an undefined value using the computed note", () => {
    expect(
      describeMetricBasis(
        metric({ unit: "fraction", value: null, note: "No delivered or delayed records." }),
      ),
    ).toBe("No delivered or delayed records.");
  });
});

describe("chart value conversion", () => {
  it("scales fractions to percent and cents to dollars", () => {
    expect(chartValue(metric({ unit: "fraction", value: 0.8468 }))).toBeCloseTo(84.68, 10);
    expect(chartValue(metric({ unit: "cents", value: 1_369_587 }))).toBeCloseTo(13_695.87, 10);
    expect(chartValue(metric({ unit: "orders", value: 400 }))).toBe(400);
    expect(chartValue(metric({ unit: "days", value: null }))).toBeNull();
  });

  it("labels axes with the right unit suffix", () => {
    expect(axisSuffix("fraction")).toBe("%");
    expect(axisSuffix("days")).toBe(" days");
    expect(axisSuffix("cents")).toBe(" USD");
    expect(axisSuffix("orders")).toBe("");
  });
});

describe("label formatting", () => {
  it("formats dates and month keys without locale dependence", () => {
    expect(formatIsoDate("2025-10-01")).toBe("1 Oct 2025");
    expect(formatIsoDate("2025-12-31")).toBe("31 Dec 2025");
    expect(formatMonthKey("2025-01")).toBe("Jan 2025");
    expect(formatMonthKey("2026-04")).toBe("Apr 2026");
  });

  it("labels group keys according to their grain", () => {
    expect(formatGroupLabel("2025-01", "month")).toBe("Jan 2025");
    expect(formatGroupLabel("2025-09-29", "week")).toBe("Week of 29 Sep 2025");
    expect(formatGroupLabel("2025-10-19", "day")).toBe("19 Oct 2025");
    expect(formatGroupLabel("delivered", "none")).toBe("delivered");
    expect(formatGroupLabel(null, "none")).toBe("Whole scope");
  });
});

describe("scope description", () => {
  const base: ResolvedScope = {
    date_field: "order_date",
    date_context: "dataset",
    reference_date: "2026-01-01",
    from: "2025-10-01",
    to: "2025-12-31",
    relative_range: "last_3_months",
    basis: "irrelevant here",
  };

  it("names the date field, the bounds and the mode", () => {
    expect(describeScope(base)).toBe(
      "Order date 1 Oct 2025 to 31 Dec 2025 (dataset mode, reference 1 Jan 2026)",
    );
  });

  it("marks a delivery-event basis distinctly", () => {
    expect(describeScope({ ...base, date_field: "delivery_date" })).toContain("Delivery date");
  });

  it("says all dates when the scope is unbounded", () => {
    expect(describeScope({ ...base, from: null, to: null })).toContain("all available dates");
  });

  it("shows the real date in current mode", () => {
    expect(
      describeScope({ ...base, date_context: "current", reference_date: "2026-09-13" }),
    ).toContain("current mode, today 13 Sep 2026");
  });
});
