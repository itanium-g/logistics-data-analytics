/**
 * Canonical API error taxonomy.
 *
 * The implementation plan requires callers to be able to distinguish bad input,
 * an unknown value, an unsupported capability, an empty result, a rate limit, a
 * provider outage and a timeout. Every non-2xx JSON response uses this shape so
 * the browser can choose an honest message without parsing prose.
 */
export const API_ERROR_CODES = [
  "bad_input",
  "unknown_value",
  "unsupported",
  "no_data",
  "data_unavailable",
  "rate_limited",
  "provider_disabled",
  "provider_outage",
  "provider_timeout",
  "provider_rate_limited",
  "provider_account_quota",
  "provider_capacity",
  "provider_rejected",
  "provider_invalid_response",
  "not_found",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorDetail {
  /** Dotted path of the offending field, when the failure is input-specific. */
  readonly path?: string;
  readonly message: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details?: readonly ApiErrorDetail[];
    /** Seconds the caller should wait, for rate-limited responses only. */
    readonly retry_after_seconds?: number;
  };
}

/** HTTP status for each error code. Kept in one place so routes stay consistent. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_input: 400,
  unknown_value: 400,
  unsupported: 422,
  no_data: 200,
  /** The dataset has not been imported, so no scope information exists. */
  data_unavailable: 503,
  rate_limited: 429,
  provider_disabled: 503,
  provider_outage: 502,
  provider_timeout: 504,
  provider_rate_limited: 429,
  provider_account_quota: 429,
  provider_capacity: 503,
  provider_rejected: 502,
  provider_invalid_response: 502,
  not_found: 404,
  internal_error: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  options: {
    details?: readonly ApiErrorDetail[];
    retryAfterSeconds?: number;
  } = {},
): ApiErrorBody {
  const error: {
    code: ApiErrorCode;
    message: string;
    details?: readonly ApiErrorDetail[];
    retry_after_seconds?: number;
  } = { code, message };
  if (options.details !== undefined && options.details.length > 0) {
    error.details = options.details;
  }
  if (options.retryAfterSeconds !== undefined) {
    error.retry_after_seconds = options.retryAfterSeconds;
  }
  return { error };
}
