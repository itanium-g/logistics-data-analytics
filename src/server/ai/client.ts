/** Native Workers AI selects one bounded operation; it never generates the answer. */
import type { AiBinding } from "../env.ts";
import { decisionTools, toolCallDecision } from "../../domain/decision.ts";
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
  | "account_quota"
  | "capacity"
  | "rejected"
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
      readonly diagnostic?: string;
      readonly providerStatus?: number;
      readonly internalCode?: number;
    };
export interface AiDecisionClient {
  readonly name: string;
  readonly model: string;
  complete(call: AiCall): Promise<AiResult>;
}
export interface WorkersAiClientOptions {
  readonly ai: AiBinding;
  readonly defaultModel?: string;
  readonly model?: string;
  readonly allowPaidEscalation?: boolean;
  readonly escalationModel?: string;
  readonly fallbackModel?: string;
  readonly gatewayId?: string;
  readonly gatewaySkipCache?: boolean;
  /** Total deadline including retries. */ readonly timeoutMs: number;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}
type AiFailure = Extract<AiResult, { ok: false }>;
const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const numeric = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const invalid = (diagnostic: string): AiFailure => ({
  ok: false,
  kind: "invalid_response",
  diagnostic,
  message:
    "The analyst returned an invalid routing decision. No operation was executed. Please try again.",
});
/** Actual native choices[].message.tool_calls shape, verified against Workers AI. */
export function normalizeWorkersAiResult(
  raw: unknown,
):
  | {
      ok: true;
      text: string;
      usage: { input_tokens: number | null; output_tokens: number | null };
    }
  | AiFailure {
  const obj = record(raw);
  if (!obj) return invalid("malformed_envelope");
  const choices = obj.choices;
  const first = Array.isArray(choices) ? record(choices[0]) : undefined;
  if (obj.finish_reason === "length" || first?.finish_reason === "length")
    return {
      ok: false,
      kind: "truncated",
      diagnostic: "output_truncated",
      message:
        "The analyst reached its output limit. No operation was executed. Please try again.",
    };
  const usage = record(obj.usage);
  const tokens = {
    input_tokens:
      numeric(usage?.prompt_tokens) ?? numeric(usage?.input_tokens) ?? null,
    output_tokens:
      numeric(usage?.completion_tokens) ??
      numeric(usage?.output_tokens) ??
      null,
  };
  if (!Array.isArray(choices) || choices.length !== 1)
    return invalid("no_single_choice");
  const calls = record(first?.message)?.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1)
    return invalid("no_single_tool_call");
  const call = record(calls[0]);
  const fn = record(call?.function);
  if (
    call?.type !== "function" ||
    typeof fn?.name !== "string" ||
    typeof fn.arguments !== "string"
  )
    return invalid("malformed_tool_call");
  let args: unknown;
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return invalid("malformed_tool_arguments");
  }
  try {
    return {
      ok: true,
      text: JSON.stringify(toolCallDecision(fn.name, args)),
      usage: tokens,
    };
  } catch {
    return invalid("unknown_tool");
  }
}
export function buildWorkersAiInputs(call: AiCall): Record<string, unknown> {
  return {
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    max_completion_tokens: call.maxOutputTokens,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
    tools: decisionTools(call.schema),
    tool_choice: "required",
    parallel_tool_calls: false,
  };
}
/** Cloudflare's 3036 is daily allocation exhaustion; 3040 is temporary capacity. */
export function classifyWorkersAiError(error: unknown): AiFailure {
  const e = record(error);
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const providerStatus =
    numeric(e?.status) ??
    numeric(e?.statusCode) ??
    (Number(message.match(/\b(4\d\d|5\d\d)\b/)?.[1]) || undefined);
  const internalCode =
    numeric(e?.internalCode) ??
    numeric(e?.code) ??
    (Number(message.match(/\b(30\d\d|5007)\b/)?.[1]) || undefined);
  const metadata = { providerStatus, internalCode };
  const retryAfter =
    numeric(e?.retryAfterSeconds) ?? numeric(e?.retryAfter) ?? 60;
  if (
    internalCode === 3036 ||
    /daily free allocation|neurons.*exceed|allocation.*exhaust/.test(lower)
  )
    return {
      ok: false,
      kind: "account_quota",
      message:
        "The Workers AI daily allocation has been used. Deterministic analytics remain available.",
      diagnostic: "provider_account_quota",
      ...metadata,
    };
  if (
    internalCode === 3040 ||
    /out of capacity|no more data centers/.test(lower)
  )
    return {
      ok: false,
      kind: "capacity",
      message:
        "Workers AI is temporarily at capacity. Please try again shortly.",
      retryAfterSeconds: retryAfter,
      diagnostic: "provider_capacity",
      ...metadata,
    };
  if (providerStatus === 429 || /rate limit|too many requests/.test(lower))
    return {
      ok: false,
      kind: "rate_limited",
      message:
        "Workers AI temporarily rate limited this request. Please try again shortly.",
      retryAfterSeconds: retryAfter,
      diagnostic: "provider_rate_limited",
      ...metadata,
    };
  if (/timeout|timed out/.test(lower) || e?.name === "AbortError")
    return {
      ok: false,
      kind: "timeout",
      message: "Workers AI timed out. No operation was executed.",
      diagnostic: "provider_timeout",
      ...metadata,
    };
  if (
    (providerStatus !== undefined &&
      providerStatus >= 400 &&
      providerStatus < 500) ||
    isBillingError(error) ||
    /no such model|model.*(not found|access)|unauthorized|permission/.test(lower)
  )
    return {
      ok: false,
      kind: "rejected",
      message:
        "Workers AI could not accept the routing request. Deterministic analytics remain available.",
      diagnostic: "provider_rejected",
      ...metadata,
    };
  return {
    ok: false,
    kind: "outage",
    message: "Workers AI is temporarily unavailable. Please try again.",
    diagnostic: "provider_unavailable",
    ...metadata,
  };
}
export function createWorkersAiClient(
  options: WorkersAiClientOptions,
): AiDecisionClient {
  const defaultModel = options.defaultModel ?? options.model ?? DEFAULT_MODEL;
  return {
    name: "workers-ai",
    model: defaultModel,
    async complete(call) {
      const escalationModel = options.escalationModel ?? ESCALATION_MODEL;
      const fallbackModel = options.fallbackModel ?? FALLBACK_MODEL;
      const route = routeModel({
        question: call.question ?? call.user,
        estimatedTokens: call.estimatedTokens,
        allowPaidEscalation: options.allowPaidEscalation === true,
        defaultModel,
        escalationModel,
        fallbackModel,
      });
      let model = route.model;
      let routeReason = route.reason;
      const deadline = Date.now() + options.timeoutMs;
      const maxRetries = options.maxRetries ?? 0;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout: AiFailure = {
          ok: false,
          kind: "timeout",
          diagnostic: "provider_timeout",
          message:
            "Workers AI timed out. No operation was executed and no retry was attempted.",
        };
        const run = async (): Promise<AiResult> => {
          try {
            const raw = await options.ai.run(
              model,
              buildWorkersAiInputs(call),
              options.gatewayId
                ? {
                    gateway: {
                      id: options.gatewayId,
                      skipCache: options.gatewaySkipCache ?? false,
                    },
                  }
                : {},
            );
            const normalized = normalizeWorkersAiResult(raw);
            return normalized.ok
              ? { ...normalized, modelUsed: model, routeReason }
              : normalized;
          } catch (error) {
            return classifyWorkersAiError(error);
          }
        };
        let result: AiResult;
        try {
          result = await Promise.race([
            run(),
            new Promise<AiFailure>((resolve) => {
              timer = setTimeout(
                () => resolve(timeout),
                Math.max(1, deadline - Date.now()),
              );
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
        if (result.ok) return result;
        // Never log questions, model text, reasoning or raw provider errors.
        console.warn("ai_provider_failure", {
          model,
          attempt: attempt + 1,
          kind: result.kind,
          diagnostic: result.diagnostic,
          status: result.providerStatus,
          internal_code: result.internalCode,
        });
        if (
          options.allowPaidEscalation === true &&
          model === escalationModel &&
          result.kind === "rejected"
        ) {
          model = fallbackModel;
          routeReason = "billing_fallback";
        } else if (result.kind !== "capacity" && result.kind !== "outage")
          return result;
        const delay =
          Math.min(options.retryDelayMs ?? 200, 1000) * (attempt + 1);
        const wait =
          result.retryAfterSeconds === undefined
            ? delay
            : Math.max(delay, result.retryAfterSeconds * 1000);
        if (attempt === maxRetries || Date.now() + wait + 1000 >= deadline)
          return result;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      return {
        ok: false,
        kind: "outage",
        message: "Workers AI is temporarily unavailable.",
      };
    },
  };
}
