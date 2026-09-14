import { describe, expect, it } from "vitest";
import {
  createWorkersAiClient,
  normalizeWorkersAiResult,
} from "../../src/server/ai/client.ts";
import { DEFAULT_MODEL, ESCALATION_MODEL, FALLBACK_MODEL } from "../../src/server/ai/models.ts";
import type { AiBinding } from "../../src/server/env.ts";

const validDecision = {
  tool: "query_metric",
  query: {
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
  },
  forecast: null,
  clarify: null,
  unsupported: null,
};

describe("Workers AI result normalizer", () => {
  it("handles string response property", () => {
    const raw = { response: JSON.stringify(validDecision), usage: { prompt_tokens: 100, completion_tokens: 20 } };
    const result = normalizeWorkersAiResult(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.text!)).toEqual(validDecision);
      expect(result.usage?.input_tokens).toBe(100);
      expect(result.usage?.output_tokens).toBe(20);
    }
  });

  it("handles object response property directly", () => {
    const raw = { response: validDecision };
    const result = normalizeWorkersAiResult(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.text!)).toEqual(validDecision);
    }
  });

  it("handles markdown code fences in response", () => {
    const raw = { response: `\`\`\`json\n${JSON.stringify(validDecision)}\n\`\`\`` };
    const result = normalizeWorkersAiResult(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.text!)).toEqual(validDecision);
    }
  });

  it("handles top-level decision object", () => {
    const result = normalizeWorkersAiResult(validDecision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.text!)).toEqual(validDecision);
    }
  });

  it("rejects null or unparseable raw values", () => {
    expect(normalizeWorkersAiResult(null).ok).toBe(false);
    expect(normalizeWorkersAiResult(undefined).ok).toBe(false);
    expect(normalizeWorkersAiResult({}).ok).toBe(false);
    expect(normalizeWorkersAiResult({ unknown_key: 123 }).ok).toBe(false);
    expect(normalizeWorkersAiResult({ response: "   " }).ok).toBe(false);
  });
});

describe("Workers AI client wrapper", () => {
  it("invokes ai.run with default Gemma 4 model and json_schema response format", async () => {
    let capturedModel = "";
    let capturedInputs: Record<string, unknown> = {};

    const ai: AiBinding = {
      run: async (model, inputs) => {
        capturedModel = model;
        capturedInputs = inputs;
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      defaultModel: DEFAULT_MODEL,
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "system prompt here",
      user: "What was the total order count?",
      schema: { type: "object" },
      maxOutputTokens: 512,
    });

    expect(client.name).toBe("workers-ai");
    expect(client.model).toBe(DEFAULT_MODEL);
    expect(capturedModel).toBe(DEFAULT_MODEL);
    expect(capturedInputs).toEqual({
      messages: [
        { role: "system", content: "system prompt here" },
        { role: "user", content: "What was the total order count?" },
      ],
      max_tokens: 512,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analytics_decision",
          strict: true,
          schema: { type: "object" },
        },
      },
    });
    expect(capturedInputs["messages"]).toEqual([
      { role: "system", content: "system prompt here" },
      { role: "user", content: "What was the total order count?" },
    ]);
    expect(capturedInputs["max_tokens"]).toBe(512);

    const format = capturedInputs["response_format"] as Record<string, any>;
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);

    expect(result.ok).toBe(true);
  });

  it("routes complex reasoning questions to GLM-5.3 Flash", async () => {
    let capturedModel = "";
    const ai: AiBinding = {
      run: async (model) => {
        capturedModel = model;
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      allowPaidEscalation: true,
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "system prompt",
      user: "Compare carrier performance between DHL and FedEx versus warehouse volume",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(true);
    expect(capturedModel).toBe(ESCALATION_MODEL);
    if (result.ok) {
      expect(result.modelUsed).toBe(ESCALATION_MODEL);
      expect(result.routeReason).toBe("complex_reasoning");
    }
  });

  it("gracefully falls back to GLM-4.7 Flash when GLM-5.3 Flash returns a billing error", async () => {
    const invokedModels: string[] = [];

    const ai: AiBinding = {
      run: async (model) => {
        invokedModels.push(model);
        if (model === ESCALATION_MODEL) {
          throw new Error("HTTP 402 Payment Required: Model requires billing to be enabled");
        }
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      allowPaidEscalation: true,
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "system prompt",
      user: "Compare delay rates versus total volumes",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(true);
    expect(invokedModels).toEqual([ESCALATION_MODEL, FALLBACK_MODEL]);
    if (result.ok) {
      expect(result.modelUsed).toBe(FALLBACK_MODEL);
      expect(result.routeReason).toBe("billing_fallback");
    }
  });

  it("does not escalate paid models by default", async () => {
    let capturedModel = "";
    const ai: AiBinding = {
      run: async (model) => {
        capturedModel = model;
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      timeoutMs: 5000,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    const result = await client.complete({
      system: "system prompt",
      user: "Compare carrier performance between DHL and FedEx versus warehouse volume",
      schema: {},
      maxOutputTokens: 512,
      estimatedTokens: 3500,
    });

    expect(result.ok).toBe(true);
    expect(capturedModel).toBe(DEFAULT_MODEL);
    if (result.ok) {
      expect(result.modelUsed).toBe(DEFAULT_MODEL);
      expect(result.routeReason).toBe("default");
    }
  });

  it("passes gateway configuration when gatewayId is configured", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const ai: AiBinding = {
      run: async (_model, _inputs, options) => {
        capturedOptions = options;
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      gatewayId: "my-analytics-gateway",
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "system prompt",
      user: "How many orders were there?",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(true);
    expect(capturedOptions).toEqual({
      gateway: {
        id: "my-analytics-gateway",
        skipCache: false,
      },
    });
  });

  it("retries on transient rate limits with backoff", async () => {
    let callCount = 0;
    const ai: AiBinding = {
      run: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("HTTP 429 Too Many Requests");
        }
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      timeoutMs: 5000,
      maxRetries: 1,
      retryDelayMs: 10,
    });

    const result = await client.complete({
      system: "system prompt",
      user: "How many orders were there?",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it("maps timeouts when client timer fires with no hidden retries", async () => {
    let callCount = 0;
    const ai: AiBinding = {
      run: async () => {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { response: JSON.stringify(validDecision) };
      },
    };

    const client = createWorkersAiClient({
      ai,
      timeoutMs: 50,
    });

    const result = await client.complete({
      system: "sys",
      user: "usr",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("timeout");
      expect(result.message).toContain("No answer was generated and no retry was attempted");
    }
    expect(callCount).toBe(1);
  });

  it("maps rate limits with retry-after header when retries exhausted", async () => {
    const ai: AiBinding = {
      run: async () => {
        throw new Error("HTTP 429 Too Many Requests - Rate limit reached");
      },
    };

    const client = createWorkersAiClient({
      ai,
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "sys",
      user: "usr",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("rate_limited");
      expect(result.retryAfterSeconds).toBe(60);
    }
  });

  it("maps server outages (500s)", async () => {
    const ai: AiBinding = {
      run: async () => {
        throw new Error("Internal Server Error (500)");
      },
    };

    const client = createWorkersAiClient({
      ai,
      timeoutMs: 5000,
    });

    const result = await client.complete({
      system: "sys",
      user: "usr",
      schema: {},
      maxOutputTokens: 512,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("outage");
      expect(result.message).toContain("Workers AI returned an error");
    }
  });
});
