import { describe, expect, it } from "vitest";
import { validateCase } from "../../scripts/eval-ai-live.ts";
import type { AskResponse } from "../../src/shared/contracts.ts";

describe("live evaluation checks semantic results", () => {
  const scalar = {
    tool: "query_metric",
    query: {
      plan: { metrics: ["total_orders"] },
      chart: { hint: "scalar" },
      summary: [{ metric: "total_orders", value: 400 }],
      rows: [{ key: null, metrics: [{ metric: "total_orders", value: 400 }] }],
    },
    forecast: null,
  } as unknown as AskResponse;
  const c = {
    id: "S01",
    question: "Order count",
    category: "supported",
    expected_tool: "query_metric",
    expected_plan: { metrics: ["total_orders"] },
    expected_chart: "scalar",
    expected_facts: { total_orders: 400 },
  };
  it("accepts the expected canonical plan, chart and computed value", () => {
    expect(validateCase(c, scalar)).toEqual([]);
  });
  it.each([
    { expected_plan: { metrics: ["delayed_orders"] } },
    { expected_chart: "bar" },
    { expected_facts: { total_orders: 401 } },
    { expected_facts: { unknown_assertion: true } },
  ])("rejects a wrong result or an unimplemented assertion", (override) => {
    expect(validateCase({ ...c, ...override }, scalar).length).toBeGreaterThan(
      0,
    );
  });
  it("does not accept an HTTP error envelope as a valid unsupported decision", () => {
    expect(
      validateCase({ ...c, expected_tool: "unsupported" }, {
        error: { code: "unsupported" },
      } as unknown as AskResponse),
    ).not.toEqual([]);
  });
});
