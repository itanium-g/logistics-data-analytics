/**
 * Natural-language routing endpoint and execution.
 *
 * Flow: bound the question, resolve runtime config, reserve quota atomically,
 * make exactly one generation via Cloudflare Workers AI, validate the decision,
 * then execute a deterministic function and render the answer from its computed fields.
 *
 * The model chooses the operation. It never sees the data, never sees the result,
 * never writes SQL, and never writes a final numerical analytical answer.
 */
import type { Hono } from "hono";
import { ManifestUnavailableError, readManifest, type StoredManifest } from "../../data/manifest.ts";
import { describePlan, renderForecastAnswer, renderQueryAnswer } from "../../domain/answer.ts";
import { parseAskRequest } from "../../domain/ask-schema.ts";
import { referenceDateFor } from "../../domain/date-context.ts";
import { DECISION_JSON_SCHEMA, parseDecisionText } from "../../domain/decision.ts";
import { ForecastError, runForecast } from "../../domain/forecast.ts";
import { parseForecastRequest } from "../../domain/forecast-schema.ts";
import { buildPrompt, estimateTokens } from "../../domain/prompt.ts";
import { parseQueryRequest } from "../../domain/query-schema.ts";
import { QueryError, runQuery } from "../../domain/query.ts";
import {
  MAX_QUESTION_CHARS,
  type AskResponse,
  type DateContext,
} from "../../shared/contracts.ts";
import type { SqlDb } from "../../shared/db.ts";
import type { ApiErrorCode, ApiErrorDetail } from "../../shared/errors.ts";
import { createWorkersAiClient, type AiDecisionClient } from "../ai/client.ts";
import { ConfigError, readAiConfig, type RuntimeAiConfig } from "../ai/config.ts";
import { admitGeneration } from "../ai/quota.ts";
import { d1SqlDb } from "../db/d1.ts";
import type { AppEnv, Env } from "../env.ts";
import { errorPayload } from "../http/respond.ts";
import { isCrossOriginBrowserRequest, readJsonBody } from "../middleware/request-guard.ts";

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
  readonly config: RuntimeAiConfig;
  readonly now: Date;
  /** Injected client backed by Workers AI or test stub */
  readonly client: AiDecisionClient;
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

  // Exactly one admitted question execution through Workers AI.
  const completion = await deps.client.complete({
    system: prompt.system,
    user: prompt.user,
    question,
    schema: DECISION_JSON_SCHEMA,
    maxOutputTokens: deps.config.maxOutputTokens,
    estimatedTokens: totalInputTokens,
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

  const modelUsed =
    "modelUsed" in completion && typeof completion.modelUsed === "string"
      ? completion.modelUsed
      : deps.client.model;

  const base = {
    question,
    provider: { name: deps.client.name, model: modelUsed },
    usage: {
      input_tokens_estimated: totalInputTokens,
      max_output_tokens: deps.config.maxOutputTokens,
    },
    data_version: deps.manifest.data_version,
    metric_version: deps.manifest.metric_version,
  } as const;

  switch (decision.value.tool) {
    case "query_metric": {
      // The model's arguments are validated by the same schema the direct API uses.
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

export function resolveAiClient(
  env: Env,
  config: RuntimeAiConfig,
): { readonly ok: true; readonly client: AiDecisionClient } | AskFailure {
  if (!env.AI) {
    return failure(
      "provider_disabled",
      "Workers AI binding is not available in the environment, so natural-language questions are disabled. Deterministic analytics remain available.",
    );
  }
  return {
    ok: true,
    client: createWorkersAiClient({
      ai: env.AI,
      defaultModel: config.model,
      escalationModel: config.escalationModel,
      fallbackModel: config.fallbackModel,
      gatewayId: config.gatewayId,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    }),
  };
}

export function registerAskRoutes(app: Hono<AppEnv>): void {
  /**
   * One question, one validated routing decision, one deterministic computation.
   * Disabled by default: without AI enabled this returns a clear unavailable state
   * while the query and forecast routes keep working.
   */
  app.post("/api/ask", async (c) => {
    if (isCrossOriginBrowserRequest(c.req.raw)) {
      return c.json(...errorPayload("bad_input", "Cross-origin browser requests are not accepted."));
    }

    const body = await readJsonBody(c.req.raw);
    if (!body.ok) {
      return c.json(...errorPayload("bad_input", body.message));
    }

    const parsed = parseAskRequest(body.value);
    if (!parsed.ok) {
      return c.json(
        ...errorPayload("bad_input", "The question request is not valid.", {
          details: parsed.issues,
        }),
      );
    }

    let config: RuntimeAiConfig;
    try {
      config = readAiConfig(c.env);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error("ai_config_error", { message: error.message });
        return c.json(
          ...errorPayload(
            "provider_disabled",
            "The model configuration is invalid, so natural-language questions are disabled. Deterministic analytics remain available.",
          ),
        );
      }
      throw error;
    }

    const db = d1SqlDb(c.env.DB);
    try {
      const manifest = await readManifest(db);

      if (!config.enabled) {
        return c.json(
          ...errorPayload(
            "provider_disabled",
            "Natural-language questions are turned off because no model provider is configured. The dashboard and the SKU forecast are computed locally and remain available.",
          ),
        );
      }

      const clientResolution = resolveAiClient(c.env, config);
      if (!clientResolution.ok) {
        return c.json(
          ...errorPayload(clientResolution.code, clientResolution.message, {
            ...(clientResolution.details === undefined ? {} : { details: clientResolution.details }),
          }),
        );
      }

      const outcome = await runAsk(
        { question: parsed.value.question, dateContext: parsed.value.date_context },
        { db, manifest, config, now: new Date(), client: clientResolution.client },
      );

      if (!outcome.ok) {
        return c.json(
          ...errorPayload(outcome.code, outcome.message, {
            ...(outcome.details === undefined ? {} : { details: outcome.details }),
            ...(outcome.retryAfterSeconds === undefined
              ? {}
              : { retryAfterSeconds: outcome.retryAfterSeconds }),
          }),
        );
      }

      return c.json(outcome.value);
    } catch (error) {
      if (error instanceof ManifestUnavailableError) {
        return c.json(...errorPayload("data_unavailable", error.message));
      }
      throw error;
    }
  });
}
