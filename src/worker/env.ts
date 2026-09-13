/**
 * Worker bindings and strict environment parsing.
 *
 * D1 is described by the minimal structural subset this application actually
 * uses. Declaring it here keeps one TypeScript project per runtime and avoids
 * pulling the full Workers global type set into the same compilation as the DOM
 * libraries. The same shape is satisfied by the node:sqlite test adapter.
 */

export interface D1PreparedStatement {
  bind(...values: readonly unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: readonly D1PreparedStatement[]): Promise<T[]>;
}

export interface Env {
  readonly DB: D1Database;

  /** Provider secret. Server-side only; never referenced by browser code. */
  readonly GROQ_API_KEY?: string;

  readonly LLM_ENABLED?: string;
  readonly LLM_PROVIDER?: string;
  readonly LLM_MODEL?: string;
  readonly LLM_BILLING_MODE?: string;
  readonly LLM_MAX_INPUT_TOKENS?: string;
  readonly LLM_MAX_BILLABLE_OUTPUT_TOKENS?: string;
  readonly LLM_DAILY_ATTEMPT_LIMIT?: string;
  readonly LLM_MONTHLY_ATTEMPT_LIMIT?: string;
  readonly LLM_DAILY_TOKEN_LIMIT?: string;
  readonly LLM_MIN_INTERVAL_SECONDS?: string;
  readonly LLM_TIMEOUT_MS?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse a boolean environment string. Only the exact strings "true" and "false"
 * are accepted so a misconfigured value fails loudly instead of silently
 * enabling a paid or unbounded code path. The plan calls this out explicitly:
 * the string "false" must never become truthy.
 */
export function parseBooleanVar(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(
    `${name} must be exactly "true" or "false"; received ${JSON.stringify(raw)}`,
  );
}

/** Parse a bounded positive integer environment string. */
export function parseIntVar(
  name: string,
  raw: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  if (raw === undefined || raw === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new ConfigError(
      `${name} must be a non-negative integer; received ${JSON.stringify(raw)}`,
    );
  }
  const value = Number.parseInt(trimmed, 10);
  if (value < bounds.min || value > bounds.max) {
    throw new ConfigError(
      `${name} must be between ${bounds.min} and ${bounds.max}; received ${value}`,
    );
  }
  return value;
}

/** Parse a value constrained to a known allowlist. */
export function parseEnumVar<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined || raw === "") return fallback;
  const value = raw.trim();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new ConfigError(
    `${name} must be one of ${allowed.join(", ")}; received ${JSON.stringify(raw)}`,
  );
}
