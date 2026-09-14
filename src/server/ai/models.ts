/**
 * Centralized Workers AI model registry, escalation, and routing policies.
 *
 * Free-tier-first architecture:
 * 1. Default: @cf/google/gemma-4-26b-a4b-it
 *    Used for every request by default, including long and comparative questions.
 * 2. Optional paid escalation: @cf/zai-org/glm-5.3-flash
 *    Available only when an operator explicitly enables paid escalation.
 * 3. Free fallback: @cf/zai-org/glm-4.7-flash
 *    Used when an explicitly enabled paid route cannot be billed.
 */

export const DEFAULT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const ESCALATION_MODEL = "@cf/zai-org/glm-5.3-flash";
export const FALLBACK_MODEL = "@cf/zai-org/glm-4.7-flash";

export type ModelSelectionReason =
  | "default"
  | "long_context"
  | "complex_reasoning"
  | "retry_escalation"
  | "billing_fallback";

export interface ModelRouteDecision {
  readonly model: string;
  readonly reason: ModelSelectionReason;
}

export interface RouteOptions {
  readonly question: string;
  readonly estimatedTokens?: number;
  readonly isRetry?: boolean;
  readonly billingDisabled?: boolean;
  /** Paid escalation is opt-in. The absent value is intentionally false. */
  readonly allowPaidEscalation?: boolean;
  readonly defaultModel?: string;
  readonly escalationModel?: string;
  readonly fallbackModel?: string;
}

/** Thresholds considered by the optional paid-escalation policy. */
export const LONG_CONTEXT_TOKEN_THRESHOLD = 3000;
export const LONG_CONTEXT_CHAR_THRESHOLD = 500;

const COMPLEX_REASONING_PATTERNS: readonly RegExp[] = [
  /\b(compare|comparison|versus|vs\.?|contrast|correlat(?:e|ion))\b/i,
  /\b(both\s+.+\s+and\s+.+)\b/i,
  /\b(trend\s+(?:and|vs|versus)\s+(?:breakdown|carrier|warehouse|region|status))\b/i,
  /\b(rate\s+of\s+.+\s+by\s+.+\s+(?:and|with|versus)\s+.+)\b/i,
  /\b(why\s+did|explain\s+why|root\s+cause|driver\s+of)\b/i,
];

/**
 * Determine if a user question requires complex multi-step reasoning or comparative analysis.
 */
export function isComplexReasoning(question: string): boolean {
  return COMPLEX_REASONING_PATTERNS.some((pattern) => pattern.test(question));
}

/**
 * Determine if a request exceeds the default prompt bounds. This signal is
 * only used for paid escalation when that policy is explicitly enabled.
 */
export function isLongContext(question: string, estimatedTokens?: number): boolean {
  if (estimatedTokens !== undefined && estimatedTokens > LONG_CONTEXT_TOKEN_THRESHOLD) {
    return true;
  }
  return question.length > LONG_CONTEXT_CHAR_THRESHOLD;
}

/**
 * Detect whether an error indicates a billing / subscription issue on a paid model.
 */
export function isBillingError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 0;

  return (
    status === 402 ||
    msg.includes("billing") ||
    msg.includes("payment required") ||
    msg.includes("subscription required") ||
    msg.includes("not enabled for billing") ||
    msg.includes("requires billing") ||
    msg.includes("paid model")
  );
}

/**
 * Route a question according to the configured cost policy. The default policy
 * deliberately keeps every route on the free-compatible default model; prompt
 * length, complexity, and retries must never silently select a paid model.
 */
export function routeModel(options: RouteOptions): ModelRouteDecision {
  const defaultM = options.defaultModel ?? DEFAULT_MODEL;
  const escalationM = options.escalationModel ?? ESCALATION_MODEL;
  const fallbackM = options.fallbackModel ?? FALLBACK_MODEL;
  const allowPaidEscalation = options.allowPaidEscalation === true;

  const targetEscalation = options.billingDisabled ? fallbackM : escalationM;

  if (options.billingDisabled) {
    return { model: fallbackM, reason: "billing_fallback" };
  }

  if (allowPaidEscalation && options.isRetry) {
    return { model: targetEscalation, reason: "retry_escalation" };
  }

  if (allowPaidEscalation && isLongContext(options.question, options.estimatedTokens)) {
    return { model: targetEscalation, reason: "long_context" };
  }

  if (allowPaidEscalation && isComplexReasoning(options.question)) {
    return { model: targetEscalation, reason: "complex_reasoning" };
  }

  return { model: defaultM, reason: "default" };
}
