/**
 * Durable AI request quota and rate-pacing admission.
 *
 * Admission is one conditional UPDATE on the durable database. Reading the
 * counters, deciding in JavaScript, and writing them back would allow race
 * conditions where concurrent requests claim the last slot. Worker-global
 * in-memory counters would reset across isolates.
 *
 * The conditional UPDATE advances the request counts, the token reservation,
 * and the pacing deadline only if every limit allows it, ensuring atomicity.
 *
 * The token reservation is an application abuse/cost bound. It does not represent
 * exact Cloudflare neuron accounting.
 */
import type { SqlDb } from "../../shared/db.ts";

export interface QuotaLimits {
  readonly dailyAttempts: number;
  readonly monthlyAttempts: number;
  readonly dailyTokens: number;
  readonly minIntervalSeconds: number;
  /** Application tokens reserved per attempt: input bound plus output bound. */
  readonly tokensPerAttempt: number;
}

export type QuotaDenialReason =
  | "paced"
  | "daily_attempts"
  | "monthly_attempts"
  | "daily_tokens"
  | "unavailable";

export type QuotaDecision =
  | {
      readonly admitted: true;
      readonly dayAttempts: number;
      readonly monthAttempts: number;
      readonly dayTokensReserved: number;
    }
  | {
      readonly admitted: false;
      readonly reason: QuotaDenialReason;
      readonly message: string;
      readonly retryAfterSeconds: number;
    };

interface UsageRow {
  readonly day_key: string;
  readonly day_attempts: number;
  readonly day_tokens_reserved: number;
  readonly month_key: string;
  readonly month_attempts: number;
  readonly next_allowed_at_ms: number;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function utcMonthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

const ADMIT_SQL = `
UPDATE llm_usage SET
  day_attempts        = CASE WHEN day_key = ?1 THEN day_attempts + 1 ELSE 1 END,
  day_tokens_reserved = CASE WHEN day_key = ?1 THEN day_tokens_reserved + ?3 ELSE ?3 END,
  month_attempts      = CASE WHEN month_key = ?2 THEN month_attempts + 1 ELSE 1 END,
  day_key             = ?1,
  month_key           = ?2,
  next_allowed_at_ms  = ?4 + ?5,
  updated_at          = ?6
WHERE id = 1
    AND (?5 = 0 OR ?4 >= next_allowed_at_ms)
  AND (CASE WHEN day_key = ?1 THEN day_attempts ELSE 0 END) < ?7
  AND (CASE WHEN month_key = ?2 THEN month_attempts ELSE 0 END) < ?8
  AND (CASE WHEN day_key = ?1 THEN day_tokens_reserved ELSE 0 END) + ?3 <= ?9
RETURNING day_attempts, month_attempts, day_tokens_reserved`;

/**
 * Attempt to reserve one generation. Returns the admitted counters, or the
 * denial reason with a retry-after hint.
 */
export async function admitGeneration(
  db: SqlDb,
  limits: QuotaLimits,
  now: Date,
): Promise<QuotaDecision> {
  const dayKey = utcDayKey(now);
  const monthKey = utcMonthKey(now);
  const nowMs = now.getTime();
  const intervalMs = limits.minIntervalSeconds * 1000;

  let admitted: {
    day_attempts: number;
    month_attempts: number;
    day_tokens_reserved: number;
  } | null;
  try {
    admitted = await db.first<{
      day_attempts: number;
      month_attempts: number;
      day_tokens_reserved: number;
    }>(ADMIT_SQL, [
      dayKey,
      monthKey,
      limits.tokensPerAttempt,
      nowMs,
      intervalMs,
      now.toISOString(),
      limits.dailyAttempts,
      limits.monthlyAttempts,
      limits.dailyTokens,
    ]);
  } catch {
    // An unconfirmed write must not lead to a generation.
    return {
      admitted: false,
      reason: "unavailable",
      message:
        "The usage guard could not be updated, so no model request was made. Deterministic analytics remain available.",
      retryAfterSeconds: 60,
    };
  }

  if (admitted !== null) {
    return {
      admitted: true,
      dayAttempts: Number(admitted.day_attempts),
      monthAttempts: Number(admitted.month_attempts),
      dayTokensReserved: Number(admitted.day_tokens_reserved),
    };
  }

  return explainDenial(db, limits, now);
}

/**
 * Read-only follow-up used solely to phrase the refusal. The admission decision
 * has already been made atomically above.
 */
async function explainDenial(
  db: SqlDb,
  limits: QuotaLimits,
  now: Date,
): Promise<QuotaDecision> {
  const row = await db.first<UsageRow>(
    "SELECT day_key, day_attempts, day_tokens_reserved, month_key, month_attempts, next_allowed_at_ms FROM llm_usage WHERE id = 1",
  );

  if (row === null) {
    return {
      admitted: false,
      reason: "unavailable",
      message:
        "Usage state is missing, so no model request was made. Apply the database migrations and try again.",
      retryAfterSeconds: 60,
    };
  }

  const dayKey = utcDayKey(now);
  const monthKey = utcMonthKey(now);
  const nowMs = now.getTime();
  const sameDay = row.day_key === dayKey;
  const sameMonth = row.month_key === monthKey;
  const dayAttempts = sameDay ? Number(row.day_attempts) : 0;
  const dayTokens = sameDay ? Number(row.day_tokens_reserved) : 0;
  const monthAttempts = sameMonth ? Number(row.month_attempts) : 0;

  if (dayAttempts >= limits.dailyAttempts) {
    return {
      admitted: false,
      reason: "daily_attempts",
      message: `The daily limit of ${limits.dailyAttempts} question${limits.dailyAttempts === 1 ? "" : "s"} has been used. The dashboard and the forecast form still work.`,
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }
  if (monthAttempts >= limits.monthlyAttempts) {
    return {
      admitted: false,
      reason: "monthly_attempts",
      message: `The monthly limit of ${limits.monthlyAttempts} questions has been used. The dashboard and the forecast form still work.`,
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }
  if (dayTokens + limits.tokensPerAttempt > limits.dailyTokens) {
    return {
      admitted: false,
      reason: "daily_tokens",
      message: `The daily application token reservation of ${limits.dailyTokens} has been used. The dashboard and the forecast form still work.`,
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }

  const waitMs = Math.max(0, Number(row.next_allowed_at_ms) - nowMs);
  return {
    admitted: false,
    reason: "paced",
    message: `Questions are paced to one every ${limits.minIntervalSeconds} seconds. Try again shortly; the dashboard and the forecast form are unaffected.`,
    retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
  };
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
