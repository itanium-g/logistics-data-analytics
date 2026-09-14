import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { selectChart } from "../src/domain/chart.ts";
import { formatGroupLabel, formatMetricValue } from "../src/domain/format.ts";
import type { QueryResponse } from "../src/shared/contracts.ts";
import app from "../src/server/index.ts";
import { EvidencePanel } from "../src/client/features/evidence/EvidencePanel.tsx";
import { KpiGrid } from "../src/client/features/overview/KpiCards.tsx";
import { ResultTable } from "../src/client/features/evidence/ResultTable.tsx";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

/**
 * These render the real components against a real API response, so the assertions
 * cover the values a reviewer actually sees rather than the shape of the data.
 * Recharts needs layout measurement, so the chart itself is verified in the
 * browser smoke run; here the table that accompanies every chart is asserted to
 * carry the same rows the chart is given.
 */
async function realQuery(binding: TestBinding, body: unknown): Promise<QueryResponse> {
  const response = await app.request(
    "/api/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { DB: binding.DB },
  );
  if (response.status !== 200) {
    throw new Error(`Query failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as QueryResponse;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe.skipIf(!hasSuppliedCsv)("dashboard rendering", () => {
  it("renders the five required KPI values with their definitions", async () => {
    const binding = createTestBinding();
    try {
      const counts = await realQuery(binding, {
        metrics: ["total_orders", "delivered_orders", "delayed_orders"],
        relative_range: "all_time",
      });
      const rates = await realQuery(binding, {
        metrics: ["on_time_rate", "avg_delivery_days"],
        relative_range: "all_time",
      });

      const html = renderToStaticMarkup(
        <KpiGrid metrics={[...counts.summary, ...rates.summary]} metricMeta={[]} />,
      );
      const text = stripTags(html);

      expect(text).toContain("Total orders");
      expect(text).toContain("400");
      expect(text).toContain("Delivered orders");
      expect(text).toContain("304");
      expect(text).toContain("Delayed orders (status proxy)");
      expect(text).toContain("55");
      expect(text).toContain("On-time delivery rate (status proxy)");
      expect(text).toContain("84.68%");
      expect(text).toContain("304 of 359 records");
      expect(text).toContain("Average delivery time (delivery-status records)");
      expect(text).toContain("3.69 days");
      expect(text).toContain("359 eligible records");
    } finally {
      binding.close();
    }
  });

  it("renders an undefined rate as N/A, never as zero percent", async () => {
    const binding = createTestBinding();
    try {
      const result = await realQuery(binding, {
        metrics: ["on_time_rate"],
        relative_range: "all_time",
        filters: [{ field: "status", op: "eq", values: ["in_transit"] }],
      });

      const text = stripTags(
        renderToStaticMarkup(<KpiGrid metrics={result.summary} metricMeta={[]} />),
      );
      expect(text).toContain("N/A");
      expect(text).not.toContain("0.00%");
      expect(text).toContain("undefined rather than zero");
    } finally {
      binding.close();
    }
  });

  it("renders the monthly table with the same rows the chart is given", async () => {
    const binding = createTestBinding();
    try {
      const result = await realQuery(binding, {
        metrics: ["total_orders"],
        time_grain: "month",
        relative_range: "last_12_months",
        limit: 100,
      });

      const text = stripTags(
        renderToStaticMarkup(<ResultTable result={result} caption="Orders per month" />),
      );

      // Every row the chart would plot appears in the table with the same label
      // and the same formatted value.
      const chart = selectChart(result.plan);
      expect(chart.hint).toBe("line");
      expect(result.rows).toHaveLength(12);
      for (const row of result.rows) {
        const metric = row.metrics.find((entry) => entry.metric === chart.value_metric);
        expect(metric).toBeDefined();
        expect(text).toContain(formatGroupLabel(row.key, result.plan.time_grain));
        if (metric !== undefined) {
          expect(text).toContain(formatMetricValue(metric));
        }
      }
      expect(text).toContain("Jan 2025");
      expect(text).toContain("Dec 2025");
      // Whole-scope footer row.
      expect(text).toContain("Whole scope");
    } finally {
      binding.close();
    }
  });

  it("renders all five status counts in the breakdown table", async () => {
    const binding = createTestBinding();
    try {
      const result = await realQuery(binding, {
        metrics: ["total_orders"],
        breakdown: "status",
        order_by: "total_orders",
        relative_range: "all_time",
        limit: 100,
      });

      const text = stripTags(
        renderToStaticMarkup(<ResultTable result={result} caption="Orders per status" />),
      );
      for (const status of ["delivered", "delayed", "in_transit", "exception", "canceled"]) {
        expect(text).toContain(status);
      }
      expect(text).toContain("304");
      expect(text).toContain("55");
      expect(text).toContain("27");
      expect(text).toContain("11");
    } finally {
      binding.close();
    }
  });

  it("renders evidence with date basis, filters, versions and caveats", async () => {
    const binding = createTestBinding();
    try {
      const result = await realQuery(binding, {
        metrics: ["delay_rate"],
        breakdown: "carrier",
        order_by: "delay_rate",
        relative_range: "all_time",
        filters: [{ field: "region", op: "eq", values: ["US-C"] }],
        limit: 100,
      });

      const text = stripTags(
        renderToStaticMarkup(
          <EvidencePanel result={result} tableCaption="Delay rate by carrier" defaultOpen />,
        ),
      );

      expect(text).toContain("Order date all available dates");
      expect(text).toContain("dataset mode, reference 1 Jan 2026");
      expect(text).toContain("delay_rate");
      expect(text).toContain("Broken down by Carrier");
      expect(text).toContain("Region is US-C");
      expect(text).toContain("data 1.0.0");
      expect(text).toContain("metric 2");
      expect(text).toContain("no promised delivery date");
      expect(text).toContain("Delay rate by carrier");
    } finally {
      binding.close();
    }
  });

  it("renders an honest empty state for an out-of-coverage scope", async () => {
    const binding = createTestBinding();
    try {
      const result = await realQuery(binding, {
        metrics: ["total_orders", "on_time_rate"],
        date_from: "2026-08-01",
        date_to: "2026-08-31",
      });

      const text = stripTags(
        renderToStaticMarkup(
          <EvidencePanel result={result} tableCaption="August 2026" defaultOpen />,
        ),
      );
      expect(text).toContain("0 records");
      expect(text).toContain("entirely outside the assumed data coverage");
      expect(text).toContain("was not shifted");
    } finally {
      binding.close();
    }
  });
});
