import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  ERROR_STATUS,
  apiError,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorDetail,
} from "../shared/errors.ts";

/**
 * Build a body/status pair for an error response so every route maps a taxonomy
 * code to the same HTTP status.
 *
 *   return c.json(...errorPayload("bad_input", "…"));
 */
export function errorPayload(
  code: ApiErrorCode,
  message: string,
  options: {
    details?: readonly ApiErrorDetail[];
    retryAfterSeconds?: number;
  } = {},
): readonly [ApiErrorBody, ContentfulStatusCode] {
  return [apiError(code, message, options), ERROR_STATUS[code] as ContentfulStatusCode] as const;
}
