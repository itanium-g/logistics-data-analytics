# AI Analyst validation — 2026-09-15

## Release state

Implementation branch: `fix/ai-analyst-workers-ai`, based on clean remote main `6dfb011022008c3d47021ee1401dcc8156a23d7a`. Real-binding validation passed; merge and production rollout are pending.

Starting Worker version: `d9c378be-20bb-42a5-9150-1d83741bd571`; deployment: `3fb3a00f-6554-4ce4-9457-90111ac7da7d`. Cloudflare did not expose a source revision. Earlier repository documentation attributed it to `16635341a6401d91670882d8d200fbeb5bb7b0bf`.

## Failure and repair

The public order-count request returned HTTP 422 `unsupported`, with the explicit detail that model output was truncated. A controlled native-binding reproduction returned `choices[0].finish_reason: length`, empty message content, reasoning content and 512 completion tokens. Gemma's documented default thinking consumed the small output budget. The old normalizer did not understand native tool calls, and malformed/truncated output was incorrectly presented as an unsupported business question.

The immediate second public request returned HTTP 429 `rate_limited` from the application's D1 global 60-second pacing guard. This was **not a Cloudflare provider 429**. No provider request occurs after a failed local admission.

The repaired flow is question → one native function call → strict decision validation → canonical domain validation → deterministic execution → deterministic numerical answer. It accepts exactly one `choices[].message.tool_calls[].function` with an allowlisted name and JSON arguments. Unknown tools, multiple calls, malformed arguments, truncation and invalid canonical plans fail closed with `provider_invalid_response`; valid unsupported decisions remain explicit application responses. Reasoning and raw provider output are never logged or shown.

The simpler function parameters omit unspecified optional fields. Existing domain defaults and allowlists remain authoritative. User date context cannot be overridden by the model. No arbitrary SQL or model-produced numerical answer is executed or trusted; there is no second summarization call.

## Empirical model selection

All probes used native Workers AI; no external provider or paid escalation was enabled.

| Minimal order-count experiment | Output | Completion tokens | Latency | Reported neurons |
|---|---|---:|---:|---:|
| Current monolithic JSON, default thinking | Truncated, empty content | 512 | 6762 ms | 14.57 |
| JSON, thinking disabled | Valid decision | 163 | 11803 ms | 5.07 |
| Native function, thinking disabled | Valid native tool call | 97 | 2001 ms | 10.245 |

These are individual observations, not stable latency/cost estimates. Full-prompt trials exposed unnecessary clarification and invalid plans with both initial contracts. After simplifying the function parameters and documenting date/event semantics, Gemma passed the final gate. GLM-4.7 Flash was tested against the same application path and remained less reliable: in the last nine-case comparison it produced invalid weekly/combined plans, extra status metrics and incorrectly answered a causal/cost question. Gemma was retained based on live results, not model specifications.

Final real-binding evaluation: **20/20 frozen cases + 14/14 repeated critical cases**. [Recorded results](../evals/live-workers-ai-2026-09-15.json) include canonical plans, answers and per-case latency. Expectations were not changed. The runner now checks plans, chart type, computed facts, API parity and unchanged dataset; HTTP errors never count as successful unsupported decisions. A local disposable quota counter was reset between experiment batches; production quota was not reset.

| Critical question | Deterministic result |
|---|---|
| Order count | 400 |
| Delayed orders weekly, last three months | Order date, 2025-10-01 through 2025-12-31, sum 10, line |
| Highest carrier delay rate | GLS, 2/7 = 28.57%, descending bar |
| Delivered late last month | Delivery date, December 2025, 4 |
| CRAYON-0008, next four months | January–April 2026; existing sparse monthly method; coverage target 3 units |
| Inventory without SKU | Clarify missing SKU; no invented identifier/value |
| Exact on-time SLA | Unsupported; offer status-proxy rate |

## Quota, errors and cost

Production configuration to deploy: Gemma `@cf/google/gemma-4-26b-a4b-it`, thinking disabled, temperature 0, 512 maximum completion tokens, 6144 estimated input bound, interval 0, retries 0, total timeout 15 seconds. Guards retain 100 daily/1000 monthly admitted requests and a 650000-token daily reservation. The reservation includes the configured maximum retry multiplier; failed provider calls retain their reservation. Disabling pacing ignores a previous pacing deadline.

Distinct errors: local quota `rate_limited`; provider generic 429 `provider_rate_limited`; Cloudflare internal 3036 `provider_account_quota`; internal 3040 `provider_capacity`; request rejection `provider_rejected`; outage `provider_outage`; timeout `provider_timeout`; malformed/truncated/no valid call `provider_invalid_response`. Tests exercise permanent errors without retries, bounded capacity/outage retries, and the total deadline. Safe logs record stage/category/model/status/internal code only.

[Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) was checked on 2026-09-15: Workers Free has 10000 neurons/day; Gemma and GLM-4.7 are free-compatible, while GLM-5.3 requires paid billing. Gemma's listed rates are 9091 neurons per million input tokens and 27273 per million output tokens; GLM-4.7 lists 5500/36400. The application's bounds target less than the free allocation for normal use, but character-based token estimates are not exact provider accounting and other account workloads share that allocation. Exhaustion fails honestly. `AI_ALLOW_PAID_ESCALATION=false`; no paid plan or service was enabled.

Request fields were verified against the current [Gemma schema](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/): native tools, `chat_template_kwargs.enable_thinking=false` and `max_completion_tokens`. No unverified seed or reasoning-effort field was added.

## Reference insight

The comparison repository at `1c1ee718dc2ece3e9ad2296060721c7f948001e3` demonstrates bounded function selection followed by Pydantic validation and deterministic computation. That simple boundary informed the function interface. Its OpenRouter/Sonnet architecture, second summarization call and forecasting assumptions were not copied.

## Verification

Current local checks: typecheck passes; **287 tests in 24 files** pass. Clean npm ci (168 packages, zero vulnerabilities), checksum-verified data import, local migrations and seed, typecheck, build, and 13/13 workerd smoke checks pass. A running Vite process initially locked npm installation; stopping it resolved the lock. Smoke first reported 12/13 because experiment-local AI enablement was active; rebuilding with AI disabled restored the deterministic 13/13 gate. Browser checks already confirmed the GLS chart/evidence and consecutive missing-SKU clarification through the real local API and Workers AI binding.

A deliberate invalid-model browser probe returned the native error 5007: No such model ... or task. The classifier now treats this as permanent provider rejection, with no retries; its captured message is covered by a regression test. Loading and recoverable error presentation were checked in Chrome DevTools.
