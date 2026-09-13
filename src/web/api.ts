/**
 * Typed browser client.
 *
 * Request shapes are imported as types only, so the server's Zod validator never
 * enters the browser bundle. Errors are surfaced with the server's taxonomy code
 * so the UI can choose an honest message instead of parsing prose.
 */
import type { AskRequestInput } from "../domain/ask-schema.ts";
import type { ForecastRequestInput } from "../domain/forecast-schema.ts";
import type { QueryRequestInput } from "../domain/query-schema.ts";
import type {
  AskResponse,
  ForecastResponse,
  MetaResponse,
  QueryResponse,
} from "../shared/contracts.ts";
import type { ApiErrorCode, ApiErrorDetail } from "../shared/errors.ts";

export class ApiError extends Error {
  readonly code: ApiErrorCode | "network_error";
  readonly details: readonly ApiErrorDetail[];
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: ApiErrorCode | "network_error",
    message: string,
    details: readonly ApiErrorDetail[] = [],
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface ErrorEnvelope {
  readonly error?: {
    readonly code?: ApiErrorCode;
    readonly message?: string;
    readonly details?: readonly ApiErrorDetail[];
    readonly retry_after_seconds?: number;
  };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "network_error",
      error instanceof Error ? error.message : "The analytics API is unreachable.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError("internal_error", "The analytics API returned a malformed response.");
    }
  }

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      envelope?.error?.code ?? "internal_error",
      envelope?.error?.message ?? `The request failed with HTTP ${response.status}.`,
      envelope?.error?.details ?? [],
      envelope?.error?.retry_after_seconds,
    );
  }

  return payload as T;
}

export function fetchMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return request<MetaResponse>("/api/meta", { signal: signal ?? null });
}

export function postQuery(
  body: QueryRequestInput,
  signal?: AbortSignal,
): Promise<QueryResponse> {
  return request<QueryResponse>("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
}

export function postForecast(
  body: ForecastRequestInput,
  signal?: AbortSignal,
): Promise<ForecastResponse> {
  return request<ForecastResponse>("/api/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
}

export function postAsk(body: AskRequestInput, signal?: AbortSignal): Promise<AskResponse> {
  return request<AskResponse>("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
}
