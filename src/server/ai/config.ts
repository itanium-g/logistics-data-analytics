import { ConfigError, parseBooleanVar, parseIntVar, type Env } from "../env.ts";
import { DEFAULT_MODEL, ESCALATION_MODEL, FALLBACK_MODEL } from "./models.ts";
import type { QuotaLimits } from "./quota.ts";

export interface RuntimeAiConfig {
  readonly enabled: boolean;
  readonly allowPaidEscalation: boolean;
  readonly model: string;
  readonly escalationModel: string;
  readonly fallbackModel: string;
  readonly gatewayId?: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly limits: QuotaLimits;
}

export function readAiConfig(env: Env): RuntimeAiConfig {
  const maxInputTokens = parseIntVar(
    "AI_MAX_INPUT_TOKENS",
    env.AI_MAX_INPUT_TOKENS,
    6144,
    {
      min: 256,
      max: 8192,
    },
  );
  const maxOutputTokens = parseIntVar(
    "AI_MAX_OUTPUT_TOKENS",
    env.AI_MAX_OUTPUT_TOKENS,
    512,
    { min: 64, max: 4096 },
  );

  return {
    enabled: parseBooleanVar("AI_ENABLED", env.AI_ENABLED, false),
    allowPaidEscalation: parseBooleanVar(
      "AI_ALLOW_PAID_ESCALATION",
      env.AI_ALLOW_PAID_ESCALATION,
      false,
    ),
    model: (env.AI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    escalationModel:
      (env.AI_ESCALATION_MODEL ?? ESCALATION_MODEL).trim() || ESCALATION_MODEL,
    fallbackModel:
      (env.AI_FALLBACK_MODEL ?? FALLBACK_MODEL).trim() || FALLBACK_MODEL,
    gatewayId: env.AI_GATEWAY_ID?.trim() || undefined,
    maxInputTokens,
    maxOutputTokens,
    timeoutMs: parseIntVar("AI_TIMEOUT_MS", env.AI_TIMEOUT_MS, 15_000, {
      min: 1000,
      max: 60_000,
    }),
    maxRetries: parseIntVar("AI_MAX_RETRIES", env.AI_MAX_RETRIES, 0, {
      min: 0,
      max: 5,
    }),
    limits: {
      dailyAttempts: parseIntVar(
        "AI_DAILY_ATTEMPT_LIMIT",
        env.AI_DAILY_ATTEMPT_LIMIT,
        100,
        {
          min: 1,
          max: 100_000,
        },
      ),
      monthlyAttempts: parseIntVar(
        "AI_MONTHLY_ATTEMPT_LIMIT",
        env.AI_MONTHLY_ATTEMPT_LIMIT,
        1000,
        { min: 1, max: 1_000_000 },
      ),
      dailyTokens: parseIntVar(
        "AI_DAILY_TOKEN_RESERVATION_LIMIT",
        env.AI_DAILY_TOKEN_RESERVATION_LIMIT,
        650_000,
        {
          min: 1000,
          max: 100_000_000,
        },
      ),
      minIntervalSeconds: parseIntVar(
        "AI_MIN_INTERVAL_SECONDS",
        env.AI_MIN_INTERVAL_SECONDS,
        0,
        { min: 0, max: 3600 },
      ),
      // The reservation assumes the worst case for this call.
      tokensPerAttempt:
        (maxInputTokens + maxOutputTokens) *
        (1 +
          parseIntVar("AI_MAX_RETRIES", env.AI_MAX_RETRIES, 0, {
            min: 0,
            max: 5,
          })),
    },
  };
}

export { ConfigError };
