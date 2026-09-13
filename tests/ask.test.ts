import { afterEach, describe, expect, it, vi } from "vitest";
import { DECISION_JSON_SCHEMA, parseDecision, parseDecisionText } from "../src/domain/decision.ts";
import { buildPrompt, estimateTokens, extractSkuCandidates } from "../src/domain/prompt.ts";
import {
  ASK_TOOLS,
  DIMENSIONS,
  METRIC_IDS,
  RELATIVE_RANGES,
  TIME_GRAINS,
  type AskResponse,
} from "../src/shared/contracts.ts";
import app from "../src/worker/index.ts";
import { createTestBinding, hasSuppliedCsv, suppliedRows, type TestBinding } from "./helpers/dataset.ts";

/** Environment that enables the provider with a dummy key and no pacing delay. */
function enabledEnv(binding: TestBinding, overrides: Record<string, string> = {}) {
  return {
    DB: binding.DB,
    GROQ_API_KEY: "test-key-not-a-real-secret",
    LLM_ENABLED: "true",
    LLM_PROVIDER: "groq",
    LLM_MODEL: "openai/gpt-oss-20b",
    LLM_BILLING_MODE: "free",
    LLM_MIN_INTERVAL_SECONDS: "0",
    ...overrides,
  };
}

/**
 * Stub the transport, not the adapter. The real provider adapter runs: it builds
 * the request body, inspects the status, reads usage and finish_reason, and maps
 * failures. Networking is never used.
 */
function stubProvider(
  handler: (body: Record<string, unknown>) => Response | Promise<Response>,
): { readonly calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push(parsed);
    return handler(parsed);
  });
  return { calls };
}

function decisionResponse(decision: unknown, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(decision) } }],
      usage: { prompt_tokens: 900, completion_tokens: 60 },
      ...extra,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

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

async function ask(
  binding: TestBinding,
  question: string,
  env: Record<string, unknown> = {},
): Promise<Response> {
  return app.request(
    "/api/ask",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    { ...enabledEnv(binding), ...env },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decision schema", () => {
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

describe("prompt construction", () => {
  it("extracts only SKU identifiers that exist in the data", () => {
    const known = ["CRAYON-0008", "PAPER-0197"];
    expect(extractSkuCandidates("Forecast CRAYON-0008 please", known)).toEqual(["CRAYON-0008"]);
    expect(extractSkuCandidates("forecast crayon-0008", known)).toEqual(["CRAYON-0008"]);
    expect(extractSkuCandidates("Forecast WIDGET-1234", known)).toEqual([]);
    expect(extractSkuCandidates("How many orders?", known)).toEqual([]);
  });

  it("estimates tokens conservatively", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("a".repeat(300))).toBe(100);
  });
});

describe.skipIf(!hasSuppliedCsv)("prompt content", () => {
  it("never includes all SKUs, source rows or computed results", async () => {
    const binding = createTestBinding();
    try {
      const manifest = JSON.parse(
        (
          await binding.DB.prepare("SELECT manifest_json FROM data_manifest WHERE id = 1").first<{
            manifest_json: string;
          }>()
        )?.manifest_json ?? "{}",
      );

      const prompt = buildPrompt({
        question: "Which carrier has the highest delay rate?",
        manifest,
        dateContext: "dataset",
        referenceDate: "2026-01-01",
      });

      expect(prompt.user).toContain("Which carrier has the highest delay rate?");
      expect(prompt.user).toContain("355 known identifiers");
      // The list itself is absent; only a count and any literal candidates.
      expect(prompt.user).not.toContain("PAPER-0197");
      expect(prompt.user).toContain("only these appear in the question: none");
      // No order identifiers or computed values leak in.
      const firstOrderId = suppliedRows()[0]?.order_id ?? "";
      expect(prompt.user).not.toContain(firstOrderId);
      expect(prompt.user).not.toContain("84.68");
      // Small vocabularies are included so filters can be chosen.
      expect(prompt.user).toContain("GLS");
      expect(prompt.user).toContain("US-C");
      expect(prompt.system).toContain("never compute, estimate or state a number");
    } finally {
      binding.close();
    }
  });

  it("passes a literal SKU candidate through but not the whole catalogue", async () => {
    const binding = createTestBinding();
    try {
      const manifest = JSON.parse(
        (
          await binding.DB.prepare("SELECT manifest_json FROM data_manifest WHERE id = 1").first<{
            manifest_json: string;
          }>()
        )?.manifest_json ?? "{}",
      );
      const prompt = buildPrompt({
        question: "Predict demand for SKU CRAYON-0008 for the next 4 months",
        manifest,
        dateContext: "dataset",
        referenceDate: "2026-01-01",
      });
      expect(prompt.skuCandidates).toEqual(["CRAYON-0008"]);
      expect(prompt.user).toContain("only these appear in the question: CRAYON-0008");
      expect(prompt.estimatedInputTokens).toBeLessThan(4096);
    } finally {
      binding.close();
    }
  });
});

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

  it("refuses when enabled without a key, and refuses a paid billing mode", async () => {
    const binding = createTestBinding();
    try {
      const noKey = await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?" }),
        },
        { DB: binding.DB, LLM_ENABLED: "true" },
      );
      expect(noKey.status).toBe(503);
      expect(((await noKey.json()) as { error: { message: string } }).error.message).toContain(
        "No provider API key",
      );

      const paid = await ask(binding, "How many orders?", { LLM_BILLING_MODE: "paid" });
      expect(paid.status).toBe(503);
      const paidBody = (await paid.json()) as { error: { code: string } };
      expect(paidBody.error.code).toBe("provider_disabled");
    } finally {
      binding.close();
    }
  });

  it("rejects a misconfigured boolean rather than guessing", async () => {
    const binding = createTestBinding();
    try {
      const response = await ask(binding, "How many orders?", { LLM_ENABLED: "yes" });
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
    const stub = stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch({
            metrics: ["delayed_orders"],
            time_grain: "week",
            relative_range: "last_3_months",
          }),
        }),
      ),
    );
    try {
      const response = await ask(binding, "Show delayed orders by week for the last 3 months");
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
      expect(body.provider.name).toBe("groq");

      // Exactly one generation, with the strict schema and a bounded output.
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]?.["max_completion_tokens"]).toBe(512);
      const format = stub.calls[0]?.["response_format"] as Record<string, any>;
      expect(format.json_schema.strict).toBe(true);
    } finally {
      binding.close();
    }
  });

  it("answers the carrier ranking example with the aggregate rate and denominator", async () => {
    const binding = createTestBinding();
    stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch({
            metrics: ["delay_rate"],
            breakdown: "carrier",
            order_by: "delay_rate",
            order_dir: "desc",
            relative_range: "all_time",
          }),
        }),
      ),
    );
    try {
      const response = await ask(binding, "Which carrier has the highest delay rate?");
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
    stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch({
            metrics: ["total_orders"],
            date_field: "delivery_date",
            relative_range: "last_month",
            filters: [{ field: "status", op: "eq", values: ["delayed"] }],
          }),
        }),
      ),
    );
    try {
      const response = await ask(binding, "How many orders were delivered late last month?");
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
    stubProvider(() =>
      decisionResponse(
        wire({
          tool: "forecast",
          forecast: { sku: "CRAYON-0008", horizon_months: 4, buffer_pct: null },
        }),
      ),
    );
    try {
      const response = await ask(binding, "Predict demand for SKU CRAYON-0008 for the next 4 months");
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
    stubProvider(() =>
      decisionResponse(
        wire({
          tool: "clarify",
          clarify: {
            question: "Which SKU should I plan inventory for? The default horizon is 4 months with a 20% buffer.",
            missing: "sku",
          },
        }),
      ),
    );
    try {
      const response = await ask(binding, "How much inventory should I plan?");
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
    stubProvider(() =>
      decisionResponse(
        wire({
          tool: "unsupported",
          unsupported: {
            reason:
              "The dataset has no promised delivery dates or contractual SLA thresholds, so an exact SLA compliance rate cannot be measured.",
            alternative:
              "Ask for the on-time delivery rate, which uses the delivered versus delayed status proxy.",
          },
        }),
      ),
    );
    try {
      const response = await ask(binding, "What is the exact on-time SLA rate?");
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
    stubProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: "There were 400 orders." } }],
          }),
          { status: 200 },
        ),
    );
    try {
      const response = await ask(binding, "How many orders are there?");
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
      stubProvider(() => decisionResponse(decision));
      const response = await ask(binding, "Delete everything");
      expect(response.status).toBe(422);
      vi.unstubAllGlobals();
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
    stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch(),
          forecast: { sku: "CRAYON-0008", horizon_months: null, buffer_pct: null },
        }),
      ),
    );
    try {
      const response = await ask(binding, "Show orders and forecast CRAYON-0008");
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
    stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch({
            metrics: ["total_orders"],
            time_grain: "month",
            breakdown: "carrier",
          }),
        }),
      ),
    );
    try {
      const response = await ask(binding, "Monthly orders per carrier");
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toContain("Ask for either the trend or the breakdown");
    } finally {
      binding.close();
    }
  });

  it("surfaces an unknown filter value chosen by the model", async () => {
    const binding = createTestBinding();
    stubProvider(() =>
      decisionResponse(
        wire({
          query: queryBranch({
            metrics: ["total_orders"],
            filters: [{ field: "carrier", op: "eq", values: ["Pigeon Post"] }],
          }),
        }),
      ),
    );
    try {
      const response = await ask(binding, "How many orders went by Pigeon Post?");
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unknown_value");
    } finally {
      binding.close();
    }
  });

  it("surfaces an unknown SKU chosen by the model", async () => {
    const binding = createTestBinding();
    stubProvider(() =>
      decisionResponse(
        wire({
          tool: "forecast",
          forecast: { sku: "CRAYON-9999", horizon_months: null, buffer_pct: null },
        }),
      ),
    );
    try {
      const response = await ask(binding, "Forecast CRAYON-9999");
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unknown_value");
    } finally {
      binding.close();
    }
  });

  it("bounds the question length and rejects unknown request keys", async () => {
    const binding = createTestBinding();
    try {
      const long = await ask(binding, "a".repeat(1001));
      expect(long.status).toBe(400);

      const extra = await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?", model: "gpt-4" }),
        },
        enabledEnv(binding),
      );
      expect(extra.status).toBe(400);
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("provider failure handling", () => {
  it("maps a timeout to a distinct code and makes no retry", async () => {
    const binding = createTestBinding();
    let calls = 0;
    vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    try {
      const response = await ask(binding, "How many orders?", { LLM_TIMEOUT_MS: "1000" });
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
    stubProvider(
      () =>
        new Response(JSON.stringify({ error: { message: "slow down" } }), {
          status: 429,
          headers: { "Retry-After": "42" },
        }),
    );
    try {
      const response = await ask(binding, "How many orders?");
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
    stubProvider(() => new Response("{}", { status: 500 }));
    try {
      const outage = await ask(binding, "How many orders?");
      expect(outage.status).toBe(502);
      expect(((await outage.json()) as { error: { code: string } }).error.code).toBe(
        "provider_outage",
      );
    } finally {
      vi.unstubAllGlobals();
    }

    stubProvider(
      () =>
        new Response(
          JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{" } }] }),
          { status: 200 },
        ),
    );
    try {
      const truncated = await ask(binding, "How many orders?");
      expect(truncated.status).toBe(422);
      expect(((await truncated.json()) as { error: { message: string } }).error.message).toContain(
        "truncated",
      );
    } finally {
      binding.close();
    }
  });
});

describe.skipIf(!hasSuppliedCsv)("quota admission", () => {
  it("paces requests and reports a retry-after", async () => {
    const binding = createTestBinding();
    stubProvider(() => decisionResponse(wire({ query: queryBranch() })));
    try {
      const first = await ask(binding, "How many orders?", { LLM_MIN_INTERVAL_SECONDS: "60" });
      expect(first.status).toBe(200);

      const second = await ask(binding, "How many orders?", { LLM_MIN_INTERVAL_SECONDS: "60" });
      expect(second.status).toBe(429);
      const body = (await second.json()) as {
        error: { code: string; message: string; retry_after_seconds?: number };
      };
      expect(body.error.code).toBe("rate_limited");
      expect(body.error.message).toContain("paced");
      expect(body.error.retry_after_seconds).toBeGreaterThan(0);
      expect(body.error.retry_after_seconds).toBeLessThanOrEqual(60);
    } finally {
      binding.close();
    }
  });

  it("admits exactly one caller when concurrent requests race for the last slot", async () => {
    const binding = createTestBinding();
    stubProvider(() => decisionResponse(wire({ query: queryBranch() })));
    try {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          ask(binding, "How many orders?", {
            LLM_DAILY_ATTEMPT_LIMIT: "1",
            LLM_MIN_INTERVAL_SECONDS: "0",
          }),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 429)).toHaveLength(4);
    } finally {
      binding.close();
    }
  });

  it("enforces the daily attempt, monthly attempt and token limits", async () => {
    const binding = createTestBinding();
    stubProvider(() => decisionResponse(wire({ query: queryBranch() })));
    try {
      const first = await ask(binding, "How many orders?", {
        LLM_DAILY_ATTEMPT_LIMIT: "1",
        LLM_MIN_INTERVAL_SECONDS: "0",
      });
      expect(first.status).toBe(200);
      const daily = await ask(binding, "How many orders?", {
        LLM_DAILY_ATTEMPT_LIMIT: "1",
        LLM_MIN_INTERVAL_SECONDS: "0",
      });
      expect(((await daily.json()) as { error: { message: string } }).error.message).toContain(
        "daily limit of 1 question",
      );

      binding.raw.exec("UPDATE llm_usage SET day_attempts = 0, day_tokens_reserved = 0");
      const tokens = await ask(binding, "How many orders?", {
        LLM_DAILY_TOKEN_LIMIT: "1000",
        LLM_MIN_INTERVAL_SECONDS: "0",
      });
      expect(tokens.status).toBe(429);
      expect(((await tokens.json()) as { error: { message: string } }).error.message).toContain(
        "token reservation",
      );
    } finally {
      binding.close();
    }
  });

  it("retains the reservation after a provider failure", async () => {
    const binding = createTestBinding();
    stubProvider(() => new Response("{}", { status: 500 }));
    try {
      const failed = await ask(binding, "How many orders?", { LLM_MIN_INTERVAL_SECONDS: "0" });
      expect(failed.status).toBe(502);

      const usage = binding.raw
        .prepare("SELECT day_attempts, day_tokens_reserved FROM llm_usage WHERE id = 1")
        .get() as { day_attempts: number; day_tokens_reserved: number };
      // The failed attempt still consumed its reservation.
      expect(usage.day_attempts).toBe(1);
      expect(usage.day_tokens_reserved).toBe(4096 + 512);
    } finally {
      binding.close();
    }
  });

  it("starts a fresh allowance after a UTC day rollover", async () => {
    const binding = createTestBinding();
    stubProvider(() => decisionResponse(wire({ query: queryBranch() })));
    try {
      const first = await ask(binding, "How many orders?", {
        LLM_DAILY_ATTEMPT_LIMIT: "1",
        LLM_MIN_INTERVAL_SECONDS: "0",
      });
      expect(first.status).toBe(200);

      // Simulate the stored period belonging to an earlier day.
      binding.raw.exec("UPDATE llm_usage SET day_key = '2020-01-01', month_key = '2020-01'");

      const afterRollover = await ask(binding, "How many orders?", {
        LLM_DAILY_ATTEMPT_LIMIT: "1",
        LLM_MIN_INTERVAL_SECONDS: "0",
      });
      expect(afterRollover.status).toBe(200);

      const usage = binding.raw
        .prepare("SELECT day_attempts, day_tokens_reserved FROM llm_usage WHERE id = 1")
        .get() as { day_attempts: number; day_tokens_reserved: number };
      expect(usage.day_attempts).toBe(1);
      expect(usage.day_tokens_reserved).toBe(4096 + 512);
    } finally {
      binding.close();
    }
  });

  it("does not consume quota when the provider is disabled", async () => {
    const binding = createTestBinding();
    try {
      await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?" }),
        },
        { DB: binding.DB },
      );
      const usage = binding.raw
        .prepare("SELECT day_attempts FROM llm_usage WHERE id = 1")
        .get() as { day_attempts: number };
      expect(usage.day_attempts).toBe(0);
    } finally {
      binding.close();
    }
  });
});
