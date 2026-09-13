/**
 * Single provider adapter.
 *
 * One request per question, a hard timeout, and no automatic retry or fallback:
 * a second call would spend quota the guard has already accounted for and could
 * turn one question into unbounded cost. Failures are mapped to the shared error
 * taxonomy so the caller can distinguish a timeout from an outage from a rate
 * limit.
 *
 * The API key is read from the Worker environment and never leaves the server.
 * `fetch` is resolved at call time so tests can substitute a transport without
 * the adapter knowing.
 */
export interface ProviderCall {
  readonly system: string;
  readonly user: string;
  readonly schema: Record<string, unknown>;
  readonly maxOutputTokens: number;
}

export type ProviderFailureKind =
  | "rate_limited"
  | "outage"
  | "timeout"
  | "invalid_response"
  | "truncated";

export type ProviderResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly usage: {
        readonly input_tokens: number | null;
        readonly output_tokens: number | null;
      };
    }
  | {
      readonly ok: false;
      readonly kind: ProviderFailureKind;
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export interface ProviderClient {
  readonly name: string;
  readonly model: string;
  complete(call: ProviderCall): Promise<ProviderResult>;
}

export interface GroqOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly endpoint?: string;
}

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly finish_reason?: string;
    readonly message?: { readonly content?: string | null };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
  readonly error?: { readonly message?: string };
}

export function createGroqClient(options: GroqOptions): ProviderClient {
  const endpoint = options.endpoint ?? GROQ_ENDPOINT;

  return {
    name: "groq",
    model: options.model,
    async complete(call: ProviderCall): Promise<ProviderResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model,
            // Bounded output, including reasoning tokens.
            max_completion_tokens: call.maxOutputTokens,
            temperature: 0,
            // Reasoning cannot be disabled on this model family; keep it low and
            // do not ask for it back.
            reasoning_effort: "low",
            include_reasoning: false,
            response_format: {
              type: "json_schema",
              json_schema: { name: "analytics_decision", strict: true, schema: call.schema },
            },
            messages: [
              { role: "system", content: call.system },
              { role: "user", content: call.user },
            ],
          }),
        });

        if (response.status === 429) {
          const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
          return {
            ok: false,
            kind: "rate_limited",
            message: "The model provider rate limited this request. No answer was generated.",
            retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 60,
          };
        }

        if (!response.ok) {
          let detail = "";
          try {
            const body = (await response.json()) as ChatCompletionResponse;
            detail = body.error?.message ?? "";
          } catch {
            detail = "";
          }
          return {
            ok: false,
            kind: "outage",
            message: `The model provider returned HTTP ${response.status}${detail === "" ? "" : `: ${detail}`}. No answer was generated.`,
          };
        }

        const body = (await response.json()) as ChatCompletionResponse;
        const choice = body.choices?.[0];
        const content = choice?.message?.content ?? "";

        if (choice?.finish_reason === "length") {
          return {
            ok: false,
            kind: "truncated",
            message:
              "The model response hit the output limit and was truncated, so no operation was executed.",
          };
        }

        if (content.trim() === "") {
          return {
            ok: false,
            kind: "invalid_response",
            message: "The model returned no content, so no operation was executed.",
          };
        }

        return {
          ok: true,
          text: content,
          usage: {
            input_tokens: body.usage?.prompt_tokens ?? null,
            output_tokens: body.usage?.completion_tokens ?? null,
          },
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return {
            ok: false,
            kind: "timeout",
            message: `The model provider did not respond within ${options.timeoutMs} ms. No answer was generated and no retry was attempted.`,
          };
        }
        return {
          ok: false,
          kind: "outage",
          message: "The model provider could not be reached. No answer was generated.",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
