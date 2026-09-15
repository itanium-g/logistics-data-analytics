import { describe, expect, it, vi } from "vitest";
import {
  createWorkersAiClient,
  normalizeWorkersAiResult,
  buildWorkersAiInputs,
  classifyWorkersAiError,
  type AiCall,
} from "../../src/server/ai/client.ts";
import {
  DECISION_JSON_SCHEMA,
  parseDecisionText,
} from "../../src/domain/decision.ts";
import {
  DEFAULT_MODEL,
  ESCALATION_MODEL,
  FALLBACK_MODEL,
} from "../../src/server/ai/models.ts";
import { nativeDecision } from "../helpers/native-ai.ts";
import fixture from "./fixtures/native-tool-call.json";
const call: AiCall = {
  system: "Route only",
  user: "How many orders?",
  schema: DECISION_JSON_SCHEMA,
  maxOutputTokens: 512,
};
describe("native Workers AI response boundary", () => {
  it("parses the captured native Gemma function envelope and token usage", () => {
    const result = normalizeWorkersAiResult(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(parseDecisionText(result.text)).toMatchObject({
        ok: true,
        value: { tool: "query_metric", query: { metrics: ["total_orders"] } },
      });
      expect(result.usage).toEqual({ input_tokens: 836, output_tokens: 97 });
    }
  });
  it.each([null, undefined, {}, "400", { response: "400" }, { choices: [] }])(
    "rejects non-tool output %j",
    (raw) => expect(normalizeWorkersAiResult(raw).ok).toBe(false),
  );
  it("detects the exact observed thinking-only truncation before parsing", () => {
    expect(
      normalizeWorkersAiResult({
        choices: [
          {
            finish_reason: "length",
            message: {
              role: "assistant",
              content: "",
              reasoning_content: "private",
            },
          },
        ],
        usage: { completion_tokens: 512 },
      }),
    ).toMatchObject({
      ok: false,
      kind: "truncated",
      diagnostic: "output_truncated",
    });
  });
  it("does not accept text-only choices or expose reasoning", () => {
    const result = normalizeWorkersAiResult({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "400", reasoning_content: "private" },
        },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostic: "no_single_tool_call",
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each(["{", "not json"])("rejects malformed tool arguments %s", (args) => {
    const raw = structuredClone(fixture);
    raw.choices[0]!.message.tool_calls[0]!.function.arguments = args;
    expect(normalizeWorkersAiResult(raw)).toMatchObject({
      ok: false,
      diagnostic: "malformed_tool_arguments",
    });
  });
  it("rejects unknown functions", () => {
    const raw = structuredClone(fixture);
    raw.choices[0]!.message.tool_calls[0]!.function.name = "raw_sql";
    expect(normalizeWorkersAiResult(raw)).toMatchObject({
      ok: false,
      diagnostic: "unknown_tool",
    });
  });
  it("rejects multiple calls and multiple choices", () => {
    const raw = structuredClone(fixture);
    raw.choices[0]!.message.tool_calls.push(
      raw.choices[0]!.message.tool_calls[0]!,
    );
    expect(normalizeWorkersAiResult(raw).ok).toBe(false);
    raw.choices.push(raw.choices[0]!);
    expect(normalizeWorkersAiResult(raw).ok).toBe(false);
  });
  it("keeps schema validation authoritative for parsed arguments", () => {
    const result = normalizeWorkersAiResult(
      nativeDecision({
        tool: "forecast",
        forecast: {
          sku: "CRAYON-0008",
          horizon_months: 4,
          buffer_pct: 20,
          sql: "DROP TABLE orders",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(parseDecisionText(result.text).ok).toBe(false);
  });
});
describe("Workers AI request and retry policy", () => {
  it("uses documented tools and disables thinking with a completion bound", () => {
    const inputs = buildWorkersAiInputs(call);
    expect(inputs).toMatchObject({
      max_completion_tokens: 512,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      tool_choice: "required",
      parallel_tool_calls: false,
    });
    expect(inputs).not.toHaveProperty("response_format");
    expect(inputs).not.toHaveProperty("max_tokens");
    expect(inputs.tools).toHaveLength(4);
  });
  it("uses the configured free model, with no paid escalation for long complex questions", async () => {
    const run = vi.fn(async (..._args: unknown[]) => fixture);
    const result = await createWorkersAiClient({
      ai: { run },
      defaultModel: FALLBACK_MODEL,
      timeoutMs: 5000,
    }).complete({
      ...call,
      user: "Compare complex performance and forecast scenarios",
      estimatedTokens: 6000,
    });
    expect(result).toMatchObject({ ok: true, modelUsed: FALLBACK_MODEL });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).not.toBe(ESCALATION_MODEL);
  });
  it("defaults to the free model", async () => {
    const run = vi.fn(async () => fixture);
    const result = await createWorkersAiClient({
      ai: { run },
      timeoutMs: 5000,
    }).complete(call);
    expect(result).toMatchObject({ ok: true, modelUsed: DEFAULT_MODEL });
  });
  it("preserves optional native gateway settings", async () => {
    const run = vi.fn(async (..._args: unknown[]) => fixture);
    await createWorkersAiClient({
      ai: { run },
      gatewayId: "test",
      timeoutMs: 5000,
    }).complete(call);
    expect(run.mock.calls[0]?.[2]).toEqual({
      gateway: { id: "test", skipCache: false },
    });
  });
  it.each([
    [
      new Error("3036: HTTP 429 daily free allocation exhausted"),
      "account_quota",
    ],
    [new Error("HTTP 429 Too Many Requests"), "rate_limited"],
    [new Error("HTTP 402 Payment Required"), "rejected"],
    [new Error("HTTP 403 model access denied"), "rejected"],
    [new Error("HTTP 400 Invalid request"), "rejected"],
    [new Error("5007: No such model @cf/invalid/diagnostic-model or task"), "rejected"],
    [new Error("timeout"), "timeout"],
  ])(
    "does not retry permanent or unclassified quota errors %s",
    async (error, kind) => {
      const run = vi.fn(async () => {
        throw error;
      });
      expect(
        await createWorkersAiClient({
          ai: { run },
          timeoutMs: 5000,
          maxRetries: 2,
        }).complete(call),
      ).toMatchObject({ ok: false, kind });
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it("classifies capacity distinctly and respects long retry hints", async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error("3040: out of capacity"), {
        status: 429,
        retryAfterSeconds: 60,
      });
    });
    expect(
      await createWorkersAiClient({
        ai: { run },
        timeoutMs: 5000,
        maxRetries: 2,
      }).complete(call),
    ).toMatchObject({
      ok: false,
      kind: "capacity",
      internalCode: 3040,
      providerStatus: 429,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it.each(["capacity", "outage"])(
    "bounds transient %s retries on the same free model",
    async (kind) => {
      const error =
        kind === "capacity"
          ? Object.assign(new Error("3040 out of capacity"), {
              retryAfterSeconds: 0,
            })
          : new Error("HTTP 503 unavailable");
      const run = vi.fn(async () => fixture).mockRejectedValueOnce(error);
      expect(
        await createWorkersAiClient({
          ai: { run },
          timeoutMs: 5000,
          maxRetries: 1,
          retryDelayMs: 0,
        }).complete(call),
      ).toMatchObject({ ok: true });
      expect(run).toHaveBeenCalledTimes(2);
    },
  );
  it("does not retry malformed output or escalate paid models", async () => {
    const run = vi.fn(async () => ({ response: "bad" }));
    expect(
      await createWorkersAiClient({
        ai: { run },
        timeoutMs: 5000,
        maxRetries: 2,
      }).complete(call),
    ).toMatchObject({ ok: false, kind: "invalid_response" });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("times out without launching another provider request", async () => {
    const run = vi.fn(() => new Promise(() => {}));
    expect(
      await createWorkersAiClient({
        ai: { run },
        timeoutMs: 10,
        maxRetries: 2,
      }).complete(call),
    ).toMatchObject({ ok: false, kind: "timeout" });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("sanitizes provider error messages", () => {
    expect(
      classifyWorkersAiError(new Error("HTTP 500 private provider context")),
    ).toMatchObject({ kind: "outage" });
    expect(
      classifyWorkersAiError(new Error("HTTP 500 private provider context"))
        .message,
    ).not.toContain("private");
  });
});
