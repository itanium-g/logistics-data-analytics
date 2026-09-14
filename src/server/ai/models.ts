/**
 * Centralized Workers AI model registry, escalation, and routing policies.
 *
 * Tiered Architecture:
 * 1. Default: @cf/google/gemma-4-26b-a4b-it
 *    Used for normal analytics, summaries, structured output, explanations, and tool calls.
 * 2. Escalation: @cf/zai-org/glm-5.3-flash
 *    Used for complex reasoning, multi-clause/comparative queries, or long-context requests.
 * 3. Fallback: @cf/zai-org/glm-4.7-flash
 *    Graceful fallback if GLM-5.3 Flash billing is not enabled or returns payment errors.
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
  readonly defaultModel?: string;
  readonly escalationModel?: string;
  readonly fallbackModel?: string;
}

/** Thresholds for triggering long-context escalation */
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
 * Determine if a request exceeds standard prompt bounds and requires a long-context model.
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
 * Route a question to the optimal model according to context length, complexity,
 * and retry/billing status.
 */
export function routeModel(options: RouteOptions): ModelRouteDecision {
  const defaultM = options.defaultModel ?? DEFAULT_MODEL;
  const escalationM = options.escalationModel ?? ESCALATION_MODEL;
  const fallbackM = options.fallbackModel ?? FALLBACK_MODEL;

  const targetEscalation = options.billingDisabled ? fallbackM : escalationM;

  if (options.billingDisabled) {
    return { model: fallbackM, reason: "billing_fallback" };
  }

  if (options.isRetry) {
    return { model: targetEscalation, reason: "retry_escalation" };
  }

  if (isLongContext(options.question, options.estimatedTokens)) {
    return { model: targetEscalation, reason: "long_context" };
  }

  if (isComplexReasoning(options.question)) {
    return { model: targetEscalation, reason: "complex_reasoning" };
  }

  return { model: defaultM, reason: "default" };
}
