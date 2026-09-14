/**
 * Native Cloudflare Workers AI client adapter with optional AI Gateway routing,
 * free-tier-first model selection, bounded retries, and graceful fallback.
 *
 * Workers AI is accessed via the native Worker `AI` binding (env.AI.run).
 * Optional Cloudflare AI Gateway routing is enabled when `gatewayId` is present.
 *
 * The raw output is normalized into decision text and passed to independent
 * application validation (parseDecisionText / parseDecision). The model output
 * is never trusted on its own.
 */
import type { AiBinding } from "../env.ts";
import {
  DEFAULT_MODEL,
  ESCALATION_MODEL,
  FALLBACK_MODEL,
  isBillingError,
  routeModel,
  type ModelSelectionReason,
} from "./models.ts";

export interface AiCall {
  readonly system: string;
  readonly user: string;
  readonly question?: string;
  readonly schema: Record<string, unknown>;
  readonly maxOutputTokens: number;
  readonly estimatedTokens?: number;
}

export type AiFailureKind =
  | "rate_limited"
  | "outage"
  | "timeout"
  | "invalid_response"
  | "truncated";

export type AiResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly usage: {
        readonly input_tokens: number | null;
        readonly output_tokens: number | null;
      };
      readonly modelUsed: string;
      readonly routeReason?: ModelSelectionReason;
    }
  | {
      readonly ok: false;
      readonly kind: AiFailureKind;
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export interface AiDecisionClient {
  readonly name: string;
  readonly model: string;
  complete(call: AiCall): Promise<AiResult>;
}

export interface WorkersAiClientOptions {
  readonly ai: AiBinding;
  /** Primary model. Defaults to Gemma 4 (@cf/google/gemma-4-26b-a4b-it). */
  readonly defaultModel?: string;
  /** Backward-compatible alias for defaultModel. */
  readonly model?: string;
  /**
   * Explicit opt-in for paid escalation. When absent or false, every request
   * and retry remains on the free-compatible default model.
   */
  readonly allowPaidEscalation?: boolean;
  /** Paid model for complex reasoning and long context when explicitly enabled. */
  readonly escalationModel?: string;
  /** Free-compatible fallback if explicitly enabled paid escalation cannot be billed. */
  readonly fallbackModel?: string;
  /** Optional Cloudflare AI Gateway identifier */
  readonly gatewayId?: string;
  readonly gatewaySkipCache?: boolean;
  /** Hard timeout in milliseconds per request */
  readonly timeoutMs: number;
  /** Number of retries on transient 429/5xx errors or malformed structured output (default 0) */
  readonly maxRetries?: number;
  /** Base delay in ms for exponential backoff (default 100ms) */
  readonly retryDelayMs?: number;
}

export function normalizeWorkersAiResult(raw: unknown): {
  ok: boolean;
  text?: string;
  usage?: { input_tokens: number | null; output_tokens: number | null };
  kind?: AiFailureKind;
  message?: string;
} {
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      kind: "invalid_response",
      message: "The model returned no content, so no operation was executed.",
    };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return {
        ok: false,
        kind: "invalid_response",
        message: "The model returned no content, so no operation was executed.",
      };
    }
    return {
      ok: true,
      text: trimmed,
      usage: { input_tokens: null, output_tokens: null },
    };
  }

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // Check for finish_reason indicating output truncation
    const finishReason =
      obj.finish_reason ??
      (Array.isArray(obj.choices)
        ? (obj.choices[0] as Record<string, unknown> | undefined)?.finish_reason
        : undefined);

    if (finishReason === "length") {
      return {
        ok: false,
        kind: "truncated",
        message:
          "The model response hit the output limit and was truncated, so no operation was executed.",
      };
    }

    // Extract usage metrics if available
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      if (typeof usage.prompt_tokens === "number") inputTokens = usage.prompt_tokens;
      else if (typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
      if (typeof usage.completion_tokens === "number") outputTokens = usage.completion_tokens;
      else if (typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
    }

    // Extract text content from standard Workers AI response shapes
    let extractedText = "";

    if ("response" in obj) {
      const resp = obj.response;
      if (typeof resp === "string") {
        extractedText = resp;
      } else if (resp !== null && typeof resp === "object") {
        extractedText = JSON.stringify(resp);
      }
    } else if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const firstChoice = obj.choices[0] as Record<string, unknown> | undefined;
      if (firstChoice) {
        const msg = firstChoice.message as Record<string, unknown> | undefined;
        if (msg && typeof msg.content === "string") {
          extractedText = msg.content;
        } else if (typeof firstChoice.text === "string") {
          extractedText = firstChoice.text;
        }
      }
    } else if ("text" in obj && typeof obj.text === "string") {
      extractedText = obj.text;
    } else if ("tool" in obj) {
      // Model returned the parsed JSON schema directly
      extractedText = JSON.stringify(obj);
    }

    let trimmed = extractedText.trim();
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }
    if (trimmed === "") {
      return {
        ok: false,
        kind: "invalid_response",
        message: "The model returned no content, so no operation was executed.",
      };
    }

    return {
      ok: true,
      text: trimmed,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  }

  return {
    ok: false,
    kind: "invalid_response",
    message: "The model returned an unparseable response.",
  };
}

/**
 * Build the native `env.AI.run()` text-generation input. Cloudflare's native
 * binding uses the OpenAI-compatible structured-output shape where `schema`
 * and `strict` live inside `response_format.json_schema`.
 */
export function buildWorkersAiInputs(call: AiCall): Record<string, unknown> {
  return {
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    max_tokens: call.maxOutputTokens,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "analytics_decision",
        strict: true,
        schema: call.schema,
      },
    },
  };
}

export function createWorkersAiClient(options: WorkersAiClientOptions): AiDecisionClient {
  const defaultModel = options.defaultModel ?? options.model ?? DEFAULT_MODEL;
  const escalationModel = options.escalationModel ?? ESCALATION_MODEL;
  const fallbackModel = options.fallbackModel ?? FALLBACK_MODEL;
  const allowPaidEscalation = options.allowPaidEscalation === true;
  const maxRetries = options.maxRetries ?? 0;
  const baseDelayMs = options.retryDelayMs ?? 100;

  return {
    name: "workers-ai",
    model: defaultModel,
    async complete(call: AiCall): Promise<AiResult> {
      const questionText =
        call.question ??
        (call.user.startsWith("Question: ")
          ? call.user.split("\n")[0]!.replace("Question: ", "")
          : call.user);

      // Centralized selection is free-tier-first unless paid escalation was
      // explicitly enabled by an operator.
      const initialRoute = routeModel({
        question: questionText,
        estimatedTokens: call.estimatedTokens,
        allowPaidEscalation,
        defaultModel,
        escalationModel,
        fallbackModel,
      });

      let currentModel = initialRoute.model;
      let routeReason = initialRoute.reason;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const timeoutPromise = new Promise<AiResult>((resolve) => {
          timer = setTimeout(() => {
            resolve({
              ok: false,
              kind: "timeout",
              message: `Workers AI did not respond within ${options.timeoutMs} ms. No answer was generated and no retry was attempted.`,
            });
          }, options.timeoutMs);
        });

        const runPromise = (async (): Promise<AiResult> => {
          try {
            // Optional AI Gateway configuration via options parameter
            const runOptions: Record<string, unknown> = {};
            if (options.gatewayId) {
              runOptions.gateway = {
                id: options.gatewayId,
                skipCache: options.gatewaySkipCache ?? false,
              };
            }

            const rawResult = await options.ai.run(
              currentModel,
              buildWorkersAiInputs(call),
              runOptions,
            );

            const norm = normalizeWorkersAiResult(rawResult);
            if (!norm.ok) {
              return {
                ok: false,
                kind: norm.kind ?? "invalid_response",
                message: norm.message ?? "The model returned an invalid response.",
              };
            }

            // Structured-output JSON validation for retry triggering
            let isJsonValid = false;
            try {
              JSON.parse(norm.text!);
              isJsonValid = true;
            } catch {
              isJsonValid = false;
            }

            if (!isJsonValid && attempt < maxRetries) {
              return {
                ok: false,
                kind: "invalid_response",
                message: "non_json_retry_needed",
              };
            }

            return {
              ok: true,
              text: norm.text!,
              usage: norm.usage!,
              modelUsed: currentModel,
              routeReason,
            };
          } catch (error) {
            // Billing fallback is reachable only after the explicit paid
            // escalation opt-in selected the paid model.
            if (allowPaidEscalation && isBillingError(error) && currentModel === escalationModel) {
              currentModel = fallbackModel;
              routeReason = "billing_fallback";
              return {
                ok: false,
                kind: "outage",
                message: "billing_fallback_needed",
              };
            }

            const message = error instanceof Error ? error.message : String(error);
            const lower = message.toLowerCase();

            if (
              lower.includes("rate limit") ||
              lower.includes("429") ||
              lower.includes("too many requests")
            ) {
              const retryAfter =
                typeof (error as { retryAfter?: unknown })?.retryAfter === "number"
                  ? ((error as { retryAfter: number }).retryAfter)
                  : typeof (error as { retryAfterSeconds?: unknown })?.retryAfterSeconds === "number"
                    ? ((error as { retryAfterSeconds: number }).retryAfterSeconds)
                    : 60;

              return {
                ok: false,
                kind: "rate_limited",
                message: "Workers AI rate limited this request. No answer was generated.",
                retryAfterSeconds: retryAfter,
              };
            }

            if (
              lower.includes("timeout") ||
              lower.includes("timed out") ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              return {
                ok: false,
                kind: "timeout",
                message: `Workers AI did not respond within ${options.timeoutMs} ms. No answer was generated and no retry was attempted.`,
              };
            }

            return {
              ok: false,
              kind: "outage",
              message: `Workers AI returned an error: ${message}. No answer was generated.`,
            };
          }
        })();

        let result: AiResult;
        try {
          result = await Promise.race([runPromise, timeoutPromise]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }

        if (result.ok) {
          return result;
        }

        // Do not retry on timeouts (preserves deterministic fast failure)
        if (result.kind === "timeout") {
          return result;
        }

        // Immediate retry without penalty if falling back from billing error
        if (result.message === "billing_fallback_needed") {
          attempt--;
          continue;
        }

        // If retries remain and the error is retryable
        if (attempt < maxRetries) {
          if (
            result.message === "non_json_retry_needed" &&
            currentModel === defaultModel &&
            allowPaidEscalation
          ) {
            currentModel = escalationModel;
            routeReason = "retry_escalation";
          }

          const delay =
            result.kind === "rate_limited" && result.retryAfterSeconds && result.retryAfterSeconds < 5
              ? result.retryAfterSeconds * 1000
              : Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 50, 1000);

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return result;
      }

      return {
        ok: false,
        kind: "outage",
        message: "Workers AI request failed after all attempts were exhausted.",
      };
    },
  };
}
