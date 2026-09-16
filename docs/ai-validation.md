# AI Analyst validation notes

## What the route does

The AI Analyst is a bounded router, not a chat model for computing answers:

1. Workers AI receives the question, date context, and a small operation contract.
2. It selects exactly one operation: `query_metric`, `forecast`, `clarify`, or `unsupported`.
3. The application validates the operation and its arguments against the same schemas used by the direct APIs.
4. Deterministic domain code queries D1 or runs the forecast and renders the answer.

The model does not receive database rows, execute SQL, or provide the numerical answer. Invalid tool names, multiple operations, malformed arguments, truncated output, unsupported questions, timeouts, and quota/provider failures fail closed with a typed error.

## Configuration

- Default model: `@cf/google/gemma-4-26b-a4b-it`
- Native binding: `AI` in `wrangler.jsonc`
- Thinking: disabled for the routing request
- Paid escalation: disabled by default (`AI_ALLOW_PAID_ESCALATION=false`)
- Local default: AI disabled (`AI_ENABLED=false`)
- Bounds: 6,144 input tokens, 512 output tokens, 15-second timeout, zero automatic retries

## Evidence in this repository

- `tests/ai/` covers configuration, prompts, decision validation, native tool-call parsing, provider errors, quota behavior, and routing.
- `evals/cases.json` contains 20 frozen cases covering supported, ambiguous, unsupported, and adversarial questions.
- `scripts/eval-ai-live.ts` can run those cases against a configured endpoint and checks the selected operation, plan, chart, computed facts, and deterministic API parity.
- `evals/live-workers-ai-2026-09-15.json` is a recorded evaluation artifact from a local endpoint. It should be treated as historical evidence, not a guarantee of current production availability.

## Production expectation

Workers AI availability, quota, and model behavior can change between runs. A live-provider pass rate is therefore not described as permanent production evidence in this repository. If the provider is disabled, rate-limited, unavailable, or returns invalid output, the dashboard, query API, and deterministic SKU forecast remain usable.

This separation keeps a transient provider problem from being presented as a business-data result. No paid escalation or external provider key is required by the default deployment.
