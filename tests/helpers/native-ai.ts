/** Native envelope captured from Gemma/GLM Workers AI, with inert synthetic ids. */
export function nativeDecision(raw: unknown): unknown {
  const decision = raw as Record<string, unknown>;
  const branches: Record<string, string> = {
    query_metric: "query",
    forecast: "forecast",
    clarify: "clarify",
    unsupported: "unsupported",
  };
  const name = String(decision?.tool ?? "unknown");
  const populated = Object.values(branches).filter(
    (key) => decision?.[key] != null,
  );
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: (populated.length > 1
            ? populated
            : [branches[name] ?? "unknown"]
          ).map((branch) => ({
            type: "function",
            id: "call_fixture",
            function: {
              name:
                populated.length > 1
                  ? Object.keys(branches).find((k) => branches[k] === branch)
                  : name,
              arguments: JSON.stringify(decision?.[branch] ?? null),
            },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 1663, completion_tokens: 80 },
  };
}
