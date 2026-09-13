/**
 * Natural-language routing endpoint logic.
 *
 * Flow: bound the question, resolve runtime config, reserve quota atomically,
 * make exactly one generation, validate the decision, then execute a
 * deterministic function and render the answer from its computed fields.
 *
 * The model chooses the operation. It never sees the data, never sees the result
 * and never writes a number.
 */
import { renderForecastAnswer, renderQueryAnswer, describePlan } from "../domain/answer.ts";
import { DECISION_JSON_SCHEMA, parseDecisionText } from "../domain/decision.ts";
import { referenceDateFor } from "../domain/date-context.ts";
import type { SqlDb } from "../shared/db.ts";
import { ForecastError, runForecast } from "../domain/forecast.ts";
import { parseForecastRequest } from "../domain/forecast-schema.ts";
import type { StoredManifest } from "../data/manifest.ts";
import { buildPrompt, estimateTokens } from "../domain/prompt.ts";
import { parseQueryRequest } from "../domain/query-schema.ts";
import { QueryError, runQuery } from "../domain/query.ts";
import {
  MAX_QUESTION_CHARS,
  type AskResponse,
  type DateContext,
} from "../shared/contracts.ts";
import type { ApiErrorCode, ApiErrorDetail } from "../shared/errors.ts";
import {
  ConfigError,
  parseBooleanVar,
  parseEnumVar,
  parseIntVar,
  type Env,
} from "./env.ts";
import type { ProviderClient } from "./provider.ts";
import { createGroqClient } from "./provider.ts";
import { admitGeneration, type QuotaLimits } from "./quota.ts";

export interface RuntimeLlmConfig {
  readonly enabled: boolean;
  readonly provider: "groq";
  readonly model: string;
  readonly billingMode: "free";
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly limits: QuotaLimits;
}

export function readLlmConfig(env: Env): RuntimeLlmConfig {
  const maxInputTokens = parseIntVar("LLM_MAX_INPUT_TOKENS", env.LLM_MAX_INPUT_TOKENS, 4096, {
    min: 256,
    max: 8192,
  });
  const maxOutputTokens = parseIntVar(
    "LLM_MAX_BILLABLE_OUTPUT_TOKENS",
    env.LLM_MAX_BILLABLE_OUTPUT_TOKENS,
    512,
    { min: 64, max: 4096 },
  );
  const billingMode = parseEnumVar(
    "LLM_BILLING_MODE",
    env.LLM_BILLING_MODE,
    ["free"] as const,
    "free",
  );

  return {
    enabled: parseBooleanVar("LLM_ENABLED", env.LLM_ENABLED, false),
    provider: parseEnumVar("LLM_PROVIDER", env.LLM_PROVIDER, ["groq"] as const, "groq"),
    model: (env.LLM_MODEL ?? "openai/gpt-oss-20b").trim(),
    billingMode,
    maxInputTokens,
    maxOutputTokens,
    timeoutMs: parseIntVar("LLM_TIMEOUT_MS", env.LLM_TIMEOUT_MS, 15_000, {
      min: 1000,
      max: 60_000,
    }),
    limits: {
      dailyAttempts: parseIntVar("LLM_DAILY_ATTEMPT_LIMIT", env.LLM_DAILY_ATTEMPT_LIMIT, 100, {
        min: 1,
        max: 100_000,
      }),
      monthlyAttempts: parseIntVar(
        "LLM_MONTHLY_ATTEMPT_LIMIT",
        env.LLM_MONTHLY_ATTEMPT_LIMIT,
        1000,
        { min: 1, max: 1_000_000 },
      ),
      dailyTokens: parseIntVar("LLM_DAILY_TOKEN_LIMIT", env.LLM_DAILY_TOKEN_LIMIT, 180_000, {
        min: 1000,
        max: 100_000_000,
      }),
      minIntervalSeconds: parseIntVar(
        "LLM_MIN_INTERVAL_SECONDS",
        env.LLM_MIN_INTERVAL_SECONDS,
        60,
        { min: 0, max: 3600 },
      ),
      // The reservation assumes the worst case for this call.
      tokensPerAttempt: maxInputTokens + maxOutputTokens,
    },
  };
}

export interface AskFailure {
  readonly ok: false;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
  readonly retryAfterSeconds?: number;
}

export type AskOutcome = { readonly ok: true; readonly value: AskResponse } | AskFailure;

export interface AskDependencies {
  readonly db: SqlDb;
  readonly manifest: StoredManifest;
  readonly config: RuntimeLlmConfig;
  readonly now: Date;
  /** Supplied by the route from env; injectable for tests. */
  readonly provider: ProviderClient;
}

export interface AskInput {
  readonly question: string;
  readonly dateContext: DateContext;
}

function failure(
  code: ApiErrorCode,
  message: string,
  extra: { details?: readonly ApiErrorDetail[]; retryAfterSeconds?: number } = {},
): AskFailure {
  return { ok: false, code, message, ...extra };
}

export async function runAsk(input: AskInput, deps: AskDependencies): Promise<AskOutcome> {
  const question = input.question.trim();
  if (question === "") {
    return failure("bad_input", "Ask a question about the order data.");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return failure(
      "bad_input",
      `Questions are limited to ${MAX_QUESTION_CHARS} characters; this one has ${question.length}.`,
    );
  }
  if (!deps.config.enabled) {
    return failure(
      "provider_disabled",
      "Natural-language questions are turned off because no model provider is configured. The dashboard and the SKU forecast are computed locally and remain available.",
    );
  }

  const referenceDate = referenceDateFor(input.dateContext, deps.now);
  const prompt = buildPrompt({
    question,
    manifest: deps.manifest,
    dateContext: input.dateContext,
    referenceDate,
  });

  const schemaTokens = estimateTokens(JSON.stringify(DECISION_JSON_SCHEMA));
  const totalInputTokens = prompt.estimatedInputTokens + schemaTokens;
  if (totalInputTokens > deps.config.maxInputTokens) {
    return failure(
      "bad_input",
      `This question would need about ${totalInputTokens} input tokens, above the configured bound of ${deps.config.maxInputTokens}. Shorten the question.`,
    );
  }

  const admission = await admitGeneration(deps.db, deps.config.limits, deps.now);
  if (!admission.admitted) {
    const code: ApiErrorCode = admission.reason === "unavailable" ? "provider_outage" : "rate_limited";
    return failure(code, admission.message, { retryAfterSeconds: admission.retryAfterSeconds });
  }

  // Exactly one generation per question.
  const completion = await deps.provider.complete({
    system: prompt.system,
    user: prompt.user,
    schema: DECISION_JSON_SCHEMA,
    maxOutputTokens: deps.config.maxOutputTokens,
  });

  if (!completion.ok) {
    const code: ApiErrorCode =
      completion.kind === "timeout"
        ? "provider_timeout"
        : completion.kind === "rate_limited"
          ? "rate_limited"
          : completion.kind === "outage"
            ? "provider_outage"
            : "unsupported";
    return failure(code, completion.message, {
      ...(completion.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: completion.retryAfterSeconds }),
    });
  }

  const decision = parseDecisionText(completion.text);
  if (!decision.ok) {
    return failure(
      "unsupported",
      "The routing decision did not match the required contract, so no operation was executed. Rephrase the question or use the dashboard filters.",
      { details: decision.issues },
    );
  }

  const base = {
    question,
    provider: { name: deps.provider.name, model: deps.provider.model },
    usage: {
      input_tokens_estimated: totalInputTokens,
      max_output_tokens: deps.config.maxOutputTokens,
    },
    data_version: deps.manifest.data_version,
    metric_version: deps.manifest.metric_version,
  } as const;

  switch (decision.value.tool) {
    case "query_metric": {
      // The model's arguments are validated by the same schema the direct API
      // uses. A schema-valid but wrong plan is a routing failure, not an answer.
      const parsed = parseQueryRequest({
        date_context: input.dateContext,
        ...decision.value.query,
      });
      if (!parsed.ok) {
        return failure(
          "unsupported",
          "The selected analytics plan was not valid, so nothing was executed.",
          { details: parsed.issues },
        );
      }
      try {
        const result = await runQuery(parsed.value, {
          db: deps.db,
          manifest: deps.manifest,
          now: deps.now,
        });
        return {
          ok: true,
          value: {
            ...base,
            tool: "query_metric",
            answer: renderQueryAnswer(result),
            interpretation: { tool: "query_metric", summary: describePlan(result.plan) },
            query: result,
            forecast: null,
            clarification: null,
            unsupported: null,
          },
        };
      } catch (error) {
        if (error instanceof QueryError) {
          return failure(error.code, error.message, {
            ...(error.field === undefined
              ? {}
              : { details: [{ path: error.field, message: error.message }] }),
          });
        }
        throw error;
      }
    }

    case "forecast": {
      const parsed = parseForecastRequest({ scope: "sku", ...decision.value.forecast });
      if (!parsed.ok) {
        return failure(
          "unsupported",
          "The selected forecast request was not valid, so nothing was executed.",
          { details: parsed.issues },
        );
      }
      try {
        const result = await runForecast(parsed.value, {
          db: deps.db,
          manifest: deps.manifest,
        });
        return {
          ok: true,
          value: {
            ...base,
            tool: "forecast",
            answer: renderForecastAnswer(result),
            interpretation: {
              tool: "forecast",
              summary: `Forecast recorded non-canceled units for ${result.sku} over ${result.horizon_months} month${result.horizon_months === 1 ? "" : "s"} with a ${result.buffer_pct}% buffer, using the ${result.method.label.toLowerCase()}.`,
            },
            query: null,
            forecast: result,
            clarification: null,
            unsupported: null,
          },
        };
      } catch (error) {
        if (error instanceof ForecastError) {
          return failure(error.code, error.message, {
            ...(error.field === undefined
              ? {}
              : { details: [{ path: error.field, message: error.message }] }),
          });
        }
        throw error;
      }
    }

    case "clarify":
      return {
        ok: true,
        value: {
          ...base,
          tool: "clarify",
          answer: decision.value.clarify.question,
          interpretation: {
            tool: "clarify",
            summary: `A required detail is missing: ${decision.value.clarify.missing}. No value was assumed and no operation ran.`,
          },
          query: null,
          forecast: null,
          clarification: decision.value.clarify,
          unsupported: null,
        },
      };

    case "unsupported":
      return {
        ok: true,
        value: {
          ...base,
          tool: "unsupported",
          answer: decision.value.unsupported.reason,
          interpretation: {
            tool: "unsupported",
            summary: "The question is outside the supported subset, so no operation ran.",
          },
          query: null,
          forecast: null,
          clarification: null,
          unsupported: decision.value.unsupported,
        },
      };
  }
}

/** Build the configured provider client, or explain why one is unavailable. */
export function resolveProvider(
  env: Env,
  config: RuntimeLlmConfig,
): { readonly ok: true; readonly client: ProviderClient } | AskFailure {
  if (config.billingMode !== "free") {
    return failure(
      "provider_disabled",
      "Only the free billing profile is enabled in this build; paid generation is refused.",
    );
  }
  const apiKey = env.GROQ_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return failure(
      "provider_disabled",
      "No provider API key is configured, so natural-language questions are unavailable. The dashboard and the SKU forecast are computed locally and remain available.",
    );
  }
  return {
    ok: true,
    client: createGroqClient({
      apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs,
    }),
  };
}

export { ConfigError };
