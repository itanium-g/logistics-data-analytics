import { describe, expect, it } from "vitest";
import { DECISION_JSON_SCHEMA, parseDecision, parseDecisionText } from "../../src/domain/decision.ts";
import {
  ASK_TOOLS,
  DIMENSIONS,
  METRIC_IDS,
  RELATIVE_RANGES,
  TIME_GRAINS,
} from "../../src/shared/contracts.ts";

/** A complete wire decision with every branch present, as strict mode requires. */
function wire(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tool: "query_metric",
    query: null,
    forecast: null,
    clarify: null,
    unsupported: null,
    ...overrides,
  };
}

function queryBranch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metrics: ["total_orders"],
    breakdown: null,
    time_grain: null,
    date_field: null,
    date_context: null,
    relative_range: null,
    date_from: null,
    date_to: null,
    filters: null,
    order_by: null,
    order_dir: null,
    limit: null,
    ...overrides,
  };
}

describe("decision schema and parsing", () => {
  it("keeps the provider schema aligned with the contract vocabulary", () => {
    const properties = DECISION_JSON_SCHEMA["properties"] as Record<string, any>;
    expect(properties["tool"].enum).toEqual([...ASK_TOOLS]);
    expect(properties["query"].properties.metrics.items.enum).toEqual([...METRIC_IDS]);
    expect(properties["query"].properties.breakdown.enum).toEqual([...DIMENSIONS, null]);
    expect(properties["query"].properties.time_grain.enum).toEqual([...TIME_GRAINS, null]);
    expect(properties["query"].properties.relative_range.enum).toEqual([...RELATIVE_RANGES, null]);
    // Strict structured output requires every property present and no extras.
    expect(DECISION_JSON_SCHEMA["additionalProperties"]).toBe(false);
    expect(properties["query"].additionalProperties).toBe(false);
    expect(DECISION_JSON_SCHEMA["required"]).toEqual([
      "tool",
      "query",
      "forecast",
      "clarify",
      "unsupported",
    ]);
  });

  it("accepts exactly one populated branch", () => {
    const parsed = parseDecision(wire({ query: queryBranch() }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.tool).toBe("query_metric");
  });

  it("rejects an array, a null and a bare string", () => {
    expect(parseDecision([wire({ query: queryBranch() })]).ok).toBe(false);
    expect(parseDecision(null).ok).toBe(false);
    expect(parseDecision("query_metric").ok).toBe(false);
  });

  it("rejects extra keys", () => {
    expect(parseDecision({ ...wire({ query: queryBranch() }), sql: "SELECT 1" }).ok).toBe(false);
    expect(
      parseDecision(wire({ query: { ...queryBranch(), raw_sql: "SELECT 1" } })).ok,
    ).toBe(false);
  });

  it("rejects an unknown tool", () => {
    expect(parseDecision(wire({ tool: "delete_orders" })).ok).toBe(false);
    expect(parseDecision(wire({ tool: "sql" })).ok).toBe(false);
  });

  it("rejects a decision whose selected branch is missing", () => {
    const parsed = parseDecision(wire({ tool: "forecast", query: queryBranch() }));
    expect(parsed.ok).toBe(false);
  });

  it("rejects two populated branches as multiple decisions", () => {
    const parsed = parseDecision(
      wire({
        query: queryBranch(),
        forecast: { sku: "CRAYON-0008", horizon_months: null, buffer_pct: null },
      }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues[0]?.message).toContain("Exactly one operation");
    }
  });

  it("rejects non-JSON, empty and fenced model text", () => {
    expect(parseDecisionText("").ok).toBe(false);
    expect(parseDecisionText("I think the answer is 400 orders.").ok).toBe(false);
    expect(parseDecisionText("```json\n{}\n```").ok).toBe(false);
  });
});
