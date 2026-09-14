import { describe, expect, it, vi } from "vitest";
import type { AskResponse } from "../../src/shared/contracts.ts";
import app from "../../src/server/index.ts";
import type { AiBinding } from "../../src/server/env.ts";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "../helpers/dataset.ts";

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

function mockAi(decisionOrFn: unknown): AiBinding {
  const handler = typeof decisionOrFn === "function"
    ? (decisionOrFn as (model: string, inputs: Record<string, unknown>) => Promise<unknown>)
    : async () => ({ response: JSON.stringify(decisionOrFn) });
  const spy = vi.fn(handler);
  return { run: spy as unknown as AiBinding["run"] };
}

function enabledEnv(binding: TestBinding, ai: AiBinding, overrides: Record<string, string> = {}) {
  return {
    DB: binding.DB,
    AI: ai,
    AI_ENABLED: "true",
    AI_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    AI_MIN_INTERVAL_SECONDS: "0",
    ...overrides,
  };
}

async function ask(
  binding: TestBinding,
  question: string,
  ai: AiBinding = mockAi(wire({ query: queryBranch() })),
  envOverrides: Record<string, string> = {},
): Promise<Response> {
  return app.request(
    "/api/ask",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    enabledEnv(binding, ai, envOverrides),
  );
}

describe.skipIf(!hasSuppliedCsv)("POST /api/ask disabled by default", () => {
  it("returns a clear unavailable state and keeps deterministic routes working", async () => {
    const binding = createTestBinding();
    try {
      const response = await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders are there?" }),
        },
        { DB: binding.DB },
      );
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("provider_disabled");
      expect(body.error.message).toContain("dashboard");

      // Deterministic analytics are unaffected.
      const query = await app.request(
        "/api/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics: ["total_orders"], relative_range: "all_time" }),
        },
        { DB: binding.DB },
      );
      expect(query.status).toBe(200);
    } finally {
      binding.close();
    }
  });

  it("refuses when AI binding is missing even if AI_ENABLED is true", async () => {
    const binding = createTestBinding();
    try {
      const noBinding = await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?" }),
        },
        { DB: binding.DB, AI_ENABLED: "true" },
      );
      expect(noBinding.status).toBe(503);
      expect(((await noBinding.json()) as { error: { message: string } }).error.message).toContain(
        "Workers AI binding is not available",
      );
    } finally {
      binding.close();
    }
  });

  it("rejects a misconfigured boolean rather than guessing", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire({ query: queryBranch() }));
    try {
      const response = await ask(binding, "How many orders?", ai, { AI_ENABLED: "yes" });
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("provider_disabled");
      expect(body.error.message).toContain("configuration is invalid");
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("POST /api/ask routing", () => {
  it("answers the delayed-by-week example with computed values and a line chart", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch({
        metrics: ["delayed_orders"],
        time_grain: "week",
        relative_range: "last_3_months",
      }),
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Show delayed orders by week for the last 3 months", ai);
      expect(response.status).toBe(200);
      const body = (await response.json()) as AskResponse;

      expect(body.tool).toBe("query_metric");
      expect(body.query?.scope.from).toBe("2025-10-01");
      expect(body.query?.scope.to).toBe("2025-12-31");
      expect(body.query?.chart.hint).toBe("line");
      const total = (body.query?.rows ?? []).reduce(
        (sum, row) => sum + (row.metrics[0]?.value ?? 0),
        0,
      );
      expect(total).toBe(10);
      expect(body.answer).toContain("Delayed orders");
      expect(body.answer).toContain("1 Oct 2025 to 31 Dec 2025");
      expect(body.interpretation.summary).toContain("delayed_orders");
      expect(body.provider.name).toBe("workers-ai");
      expect(body.provider.model).toBe("@cf/google/gemma-4-26b-a4b-it");

      expect(ai.run).toHaveBeenCalledTimes(1);
    } finally {
      binding.close();
    }
  });

  it("answers the carrier ranking example with the aggregate rate and denominator", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch({
        metrics: ["delay_rate"],
        breakdown: "carrier",
        order_by: "delay_rate",
        order_dir: "desc",
        relative_range: "all_time",
      }),
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Which carrier has the highest delay rate?", ai);
      const body = (await response.json()) as AskResponse;
      expect(body.query?.rows[0]?.key).toBe("GLS");
      expect(body.answer).toContain("GLS");
      expect(body.answer).toContain("28.57%");
      expect(body.answer).toContain("2 of 7 records");
      expect(body.query?.chart.hint).toBe("bar");
    } finally {
      binding.close();
    }
  });

  it("answers the late-deliveries example on the delivery date basis", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch({
        metrics: ["total_orders"],
        date_field: "delivery_date",
        relative_range: "last_month",
        filters: [{ field: "status", op: "eq", values: ["delayed"] }],
      }),
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "How many orders were delivered late last month?", ai);
      const body = (await response.json()) as AskResponse;
      expect(body.query?.scope.date_field).toBe("delivery_date");
      expect(body.query?.scope.from).toBe("2025-12-01");
      expect(body.query?.rows[0]?.metrics[0]?.value).toBe(4);
      expect(body.answer).toContain("4");
      expect(body.interpretation.summary).toContain("on delivery date");
      expect(body.query?.assumptions.join(" ")).toContain("no promised delivery date");
    } finally {
      binding.close();
    }
  });

  it("routes a SKU question to the forecast tool with its inventory target", async () => {
    const binding = createTestBinding();
    const decision = wire({
      tool: "forecast",
      forecast: { sku: "CRAYON-0008", horizon_months: 4, buffer_pct: null },
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Predict demand for SKU CRAYON-0008 for the next 4 months", ai);
      const body = (await response.json()) as AskResponse;
      expect(body.tool).toBe("forecast");
      expect(body.forecast?.coverage_target_units).toBe(3);
      expect(body.forecast?.forecast).toHaveLength(4);
      expect(body.answer).toContain("3 units");
      expect(body.answer).toContain("not a net purchase quantity");
      expect(body.query).toBeNull();
    } finally {
      binding.close();
    }
  });

  it("asks for a SKU instead of inventing one", async () => {
    const binding = createTestBinding();
    const decision = wire({
      tool: "clarify",
      clarify: {
        question: "Which SKU should I plan inventory for? The default horizon is 4 months with a 20% buffer.",
        missing: "sku",
      },
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "How much inventory should I plan?", ai);
      const body = (await response.json()) as AskResponse;
      expect(body.tool).toBe("clarify");
      expect(body.clarification?.missing).toBe("sku");
      expect(body.answer).toContain("Which SKU");
      expect(body.forecast).toBeNull();
      // No number was fabricated.
      expect(body.answer).not.toMatch(/\b\d+ units\b/);
    } finally {
      binding.close();
    }
  });

  it("explains that an exact SLA rate cannot be measured", async () => {
    const binding = createTestBinding();
    const decision = wire({
      tool: "unsupported",
      unsupported: {
        reason:
          "The dataset has no promised delivery dates or contractual SLA thresholds, so an exact SLA compliance rate cannot be measured.",
        alternative:
          "Ask for the on-time delivery rate, which uses the delivered versus delayed status proxy.",
      },
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "What is the exact on-time SLA rate?", ai);
      const body = (await response.json()) as AskResponse;
      expect(body.tool).toBe("unsupported");
      expect(body.answer).toContain("no promised delivery dates");
      expect(body.unsupported?.alternative).toContain("status proxy");
      expect(body.query).toBeNull();
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("POST /api/ask rejects unsafe or invalid decisions", () => {
  it("executes nothing when the model returns prose", async () => {
    const binding = createTestBinding();
    const ai = mockAi({ response: "There were 400 orders." });

    try {
      const response = await ask(binding, "How many orders are there?", ai);
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("unsupported");
      expect(body.error.message).toContain("did not match the required contract");
    } finally {
      binding.close();
    }
  });

  it("executes nothing when the model asks for SQL or an unknown tool", async () => {
    const binding = createTestBinding();
    for (const decision of [
      { tool: "sql", query: null, forecast: null, clarify: null, unsupported: null },
      wire({ query: { ...queryBranch(), raw_sql: "DROP TABLE orders" } }),
      wire({ query: queryBranch({ metrics: ["total_orders'; DROP TABLE orders; --"] }) }),
    ]) {
      const ai = mockAi(decision);
      const response = await ask(binding, "Delete everything", ai);
      expect(response.status).toBe(422);
    }
    try {
      // The dataset is intact.
      const check = await app.request(
        "/api/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics: ["total_orders"], relative_range: "all_time" }),
        },
        { DB: binding.DB },
      );
      const body = (await check.json()) as { rows: { metrics: { value: number }[] }[] };
      expect(body.rows[0]?.metrics[0]?.value).toBe(400);
    } finally {
      binding.close();
    }
  });

  it("executes nothing when two operations are requested at once", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch(),
      forecast: { sku: "CRAYON-0008", horizon_months: null, buffer_pct: null },
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Show orders and forecast CRAYON-0008", ai);
      expect(response.status).toBe(422);
      const body = (await response.json()) as {
        error: { details?: { message: string }[] };
      };
      expect(JSON.stringify(body.error.details)).toContain("Exactly one operation");
    } finally {
      binding.close();
    }
  });

  it("surfaces an unsupported combination chosen by the model", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch({
        metrics: ["total_orders"],
        time_grain: "month",
        breakdown: "carrier",
      }),
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Monthly orders per carrier", ai);
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toContain("Ask for either the trend or the breakdown");
    } finally {
      binding.close();
    }
  });

  it("surfaces an unknown filter value chosen by the model", async () => {
    const binding = createTestBinding();
    const decision = wire({
      query: queryBranch({
        metrics: ["total_orders"],
        filters: [{ field: "carrier", op: "eq", values: ["Pigeon Post"] }],
      }),
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "How many orders went by Pigeon Post?", ai);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unknown_value");
    } finally {
      binding.close();
    }
  });

  it("surfaces an unknown SKU chosen by the model", async () => {
    const binding = createTestBinding();
    const decision = wire({
      tool: "forecast",
      forecast: { sku: "CRAYON-9999", horizon_months: null, buffer_pct: null },
    });
    const ai = mockAi(decision);

    try {
      const response = await ask(binding, "Forecast CRAYON-9999", ai);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unknown_value");
    } finally {
      binding.close();
    }
  });

  it("bounds the question length and rejects unknown request keys", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire({ query: queryBranch() }));
    try {
      const long = await ask(binding, "a".repeat(1001), ai);
      expect(long.status).toBe(400);

      const extra = await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?", model: "gpt-4" }),
        },
        enabledEnv(binding, ai),
      );
      expect(extra.status).toBe(400);
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("Workers AI failure handling", () => {
  it("maps a timeout to a distinct code and makes no retry", async () => {
    const binding = createTestBinding();
    let calls = 0;
    const ai: AiBinding = {
      run: vi.fn((_model, _inputs, options) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }),
    };

    try {
      const response = await ask(binding, "How many orders?", ai, { AI_TIMEOUT_MS: "1000" });
      expect(response.status).toBe(504);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("provider_timeout");
      expect(body.error.message).toContain("no retry was attempted");
      expect(calls).toBe(1);
    } finally {
      binding.close();
    }
  });

  it("maps a provider rate limit and passes the retry-after through", async () => {
    const binding = createTestBinding();
    const ai: AiBinding = {
      run: vi.fn(async () => {
        const err = new Error("Rate limit exceeded");
        (err as any).status = 429;
        (err as any).retryAfter = 42;
        throw err;
      }),
    };

    try {
      const response = await ask(binding, "How many orders?", ai);
      expect(response.status).toBe(429);
      const body = (await response.json()) as {
        error: { code: string; retry_after_seconds?: number };
      };
      expect(body.error.code).toBe("rate_limited");
      expect(body.error.retry_after_seconds).toBe(42);
    } finally {
      binding.close();
    }
  });

  it("maps an outage and a truncated response", async () => {
    const binding = createTestBinding();
    const outageAi: AiBinding = {
      run: vi.fn(async () => {
        const err = new Error("Workers AI internal error");
        (err as any).status = 500;
        throw err;
      }),
    };

    try {
      const outage = await ask(binding, "How many orders?", outageAi);
      expect(outage.status).toBe(502);
      expect(((await outage.json()) as { error: { code: string } }).error.code).toBe(
        "provider_outage",
      );
    } finally {
      // closed below
    }

    const truncatedAi: AiBinding = {
      run: vi.fn(async () => ({
        response: "{",
      })),
    };

    try {
      const truncated = await ask(binding, "How many orders?", truncatedAi);
      expect(truncated.status).toBe(422);
      expect(((await truncated.json()) as { error: { message: string } }).error.message).toContain(
        "did not match the required contract",
      );
    } finally {
      binding.close();
    }
  });
});
