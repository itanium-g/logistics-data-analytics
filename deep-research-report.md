# Spaceship Logistics Analytics — Audited Research and Architecture

Updated: 2026-09-11 (UTC). Status: **design complete subject to the evidence gates below; application not implemented or benchmarked in this repository**.

This report owns audit evidence and analytical meaning. [SETUP_AND_COMPARISON.md](SETUP_AND_COMPARISON.md) owns the complete setup, current stack, hosting/LLM matrices and cost calculations. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) owns contracts, backlog, estimates and acceptance gates. Shared decisions are updated together.

## 1. Decision

Build a **single-origin TypeScript modular monolith**: React SPA and Hono API on Cloudflare Workers with Static Assets; D1 for the small relational dataset and durable usage controls. Keep calculations deterministic. Use at most one model generation to translate a new question into a validated analytical operation, then render the answer from computed results.

For this 400-row exercise, the strongest design is a small, inspectable system with exact metrics, explicit assumptions, tests, and bounded costs. It does not need an always-on Python server, two hosting vendors, server-side rendering, a vector database, or an autonomous agent.

The operating-cost target is **$0 for a reviewer demo within both hosting and model quotas**. Paid model candidates range from $0.038 to $0.23 for 1,000 questions at the nominal 1,500-input/200-total-output workload; Groq GPT-OSS 20B is $0.1725 at that workload. These are token-consumption estimates, not account-opening cash, measured reasoning usage, or quality guarantees. Workers Paid adds a $5/month base when needed. Keep the $2/month application model ceiling and independent request/token caps.

Evaluate **Groq openai/gpt-oss-20b Free** against **DeepInfra google/gemma-4-E4B-it**. Prefer free Groq if it passes the routing/latency gates and quota fits; compare measured cost per successful task and migration effort before choosing paid access. DeepInfra Llama 3.1 8B is the cheapest standard paid token baseline found in the shortlist; Gemini 2.5 Flash-Lite remains an optional comparator. No model has passed a live project evaluation yet. A premium coding assistant used to author documents does not determine the runtime model.

**Decision boundary:** no mandatory language or deadline was recovered from the earlier chat. The original assignment is still unavailable. If it mandates Python, a particular framework, Docker deployment, or capabilities beyond this scope, reconcile that before implementation. If substantial unpushed Python application code already exists, audit it before a rewrite: engineering time can outweigh years of small hosting savings.

## 2. Evidence and limits

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [Target repository at 8fdab002](https://github.com/itanium-g/logistics-data-analytics/tree/8fdab0029a065b230bcdc7f81c18bc3836fb0e4c) | The audited baseline contains only this report and the implementation plan. | A working application, passing application tests, or a deployment. |
| [Answer/reference repository](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics>) ([audited snapshot 1c1ee718](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3>)) | Inspectable code, CSV, tests, and the reference author's decisions. | Authoritative assignment requirements or permission to copy the implementation. |
| [Reference AI disclosure](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/AI_USAGE.md) | The author reports an AI-disclosure requirement and bonus topics including caching, Docker, tests, explainability, and ambiguity handling. | Independent verification of the original rubric. |
| [Original Notion brief and attachments](<https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24>) | Identifies the assignment source and linked materials to verify. | The connected Notion workspace did not expose the page contents during this update; inferred scope remains provisional and is not quoted as authoritative. |
| [Current target snapshot e5a5e67](https://github.com/itanium-g/logistics-data-analytics/tree/e5a5e67cb11c9d6e797ce9fe9421dfed2e77d8a9) | Before this rewrite, main contained README, report and plan; recent source links were preserved. | An implemented application. |
| Official vendor documentation linked here and in the setup guide | Broader provider research September 10; recommended stack and selected prices/capabilities refreshed September 11. | Account eligibility, actual performance, future pricing, or compatibility of an unbuilt lockfile. |

Dashboards, natural-language analytics, category forecasting, inspectable results, deployment, tests, and documentation are a reasonable reconstruction from the reference, not a verified exhaustive brief. Treat them as the proposed scope until Gate G00 in the plan resolves the original requirements.

The reference tree has no license file in the audited snapshot. Use it as evidence and architectural inspiration; do not assume unrestricted reuse of its code, data, or assets. Obtain the assigned dataset and its redistribution terms before shipping. This revision does not copy application code or publish data.

## 3. Audit findings and corrections

Severity describes the consequence **if carried into the build**, not a vulnerability proved in an application in this target repository.

| ID | Severity | Finding | Correction in this revision |
|---|---|---|---|
| A01 | High | Earlier executive/risk sections called revenue at risk undefined, contradicting the registry and the report's own verified formula. | Define it as raw value on delayed or exception rows: $2,386.10. Label it exposure, not expected loss. |
| A02 | High | Reference forecast counts orders but calls the buffered result inventory units; it also forces a minimum recommendation of one. | Forecast non-canceled quantity, allow zero, and separate a demand-buffer scenario from a purchase decision. |
| A03 | High | “On-time” and “completed” labels overstate what statuses prove without an SLA field or event history. | Preserve reference formulas for comparison, but label them status-based proxies and expose the denominator. |
| A04 | High | Mocked responses were treated as evidence of model routing accuracy. | Separate deterministic integration tests from a held-out, real-provider evaluation. No accuracy result is claimed yet. |
| A05 | High | Taking the first tool call silently drops additional operations; JSON arrays/null can escape object-oriented parsing. | Require exactly one validated routing decision; reject malformed, extra, or multiple operations before execution. |
| A06 | High | Alphabetical group ordering plus LIMIT cannot answer “top”; summarizing the first 20 rows cannot establish a global ranking or total. | Aggregate the full scope, rank before limiting, use deterministic tie-breaking, and label returned versus total groups. No model-written numerical summary. |
| A07 | High | Public paid Ask endpoint lacked a credible durable cost boundary. | Reviewer access, input/output caps, atomic durable reservations, provider timeout, and fail-closed behavior precede paid activation. |
| A08 | Medium | Separate dashboard SQL weakens the single-metric-definition claim. | All KPI/chart/Ask paths use the same registry and query compiler; composite charts request multiple registered metrics. |
| A09 | Medium | Hard-coded “today” and a fixed complete-year forecast grid conceal stale or incomplete coverage. | Runtime clock and versioned data manifest; explicit relative-date policy and coverage flags. |
| A10 | Medium | Railway's $1 allowance was described as a monthly charge. | It is Free-plan monthly resource credit; Hobby is a separate $5 minimum commitment. |
| A11 | Medium | Universal DuckDB cursor-serialization wording ignored conflicting official documentation. | Avoid relying on that assertion; the Python fallback requires an explicit concurrency policy and tests. |
| A12 | Medium | Removing one of two model calls was equated with halving the bill; prompt caching was advertised without workload evidence. | Price actual token paths; cache only when measured benefit exceeds complexity and any write/storage cost. |
| A13 | Medium | Old plan line items summed to 8.75–12.0 days, not the stated 9.0–12.5; priorities disagreed about evaluations and intervals. | One authoritative phased estimate and P0/P1/P2 scope in the plan; real evaluation is P0 for a live Ask release, calibrated intervals are not. |
| A14 | Medium | Subjective architecture scores and external benchmarks implied project-specific evidence. | Replace numerical ratings with testable trade-offs and clearly distinguish projections from observations. |
| A15 | Medium | Gemini-only pricing omitted materially cheaper and recurring free APIs. | Add complete hosting/LLM matrices, suitability gates, deposits, trial distinctions and cost sensitivity. |
| A16 | Medium | The old 8,192-input-token cap exceeds Groq Free's documented 8K TPM before output. | Use a proposed 4,096 input / 512 billable output cap with durable free pacing and token reservations. |
| A17 | Medium | The prior stack snapshot predates React 19.3; fixed model names were treated too much like immutable versions. | Refresh stable dependencies and record served model versions/lifecycle changes; evaluate before migration. |

Code evidence: [registry](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/app/registry.py), [query builder](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/app/tools/query_metric.py), [orchestrator](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/app/llm/orchestrator.py), [forecast](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/app/tools/forecast.py), [chart handlers](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/app/api/charts.py), and [smoke tests](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/tests/test_smoke.py).

## 4. Verified data facts and analytical meaning

The [pinned reference CSV](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/data/mock_logistics_data.csv), Git blob dc20411f5b37c57af46f2ae42c0802d5a19d0ea9, was independently parsed for this audit. Money totals below were calculated in integer cents, not rounded binary-floating-point sums.

| Check | Observed result |
|---|---:|
| Rows / columns / unique order IDs | 400 / 17 / 400 |
| Observed order-date range | 2025-01-01 through 2025-12-30 |
| Delivered / delayed / exception | 304 / 55 / 11 |
| In transit / canceled | 27 / 3 |
| Rows with a delivery date | 370 |
| Duplicate order IDs / delivery dates before order dates | 0 / 0 |
| Raw order value, all statuses | $13,695.87 |
| Raw value on delayed or exception rows | $2,386.10 |
| Quantity, all statuses / excluding canceled | 1,310 / 1,303 |
| Unique SKUs / categories | 355 / 8 |
| Rows where quantity × unit price differs from raw order value | 0 |

These checks describe this file, not the trustworthiness or completeness of a real logistics feed. Order IDs contain “2026” while order dates are in 2025; treat IDs as opaque identifiers and use the date columns for time analysis.

### Metric policy

The reference has nine metric IDs. Retain them for traceability, with honest display labels and definitions; add total_units and demand_units for explicit quantity semantics. The plan contains the exact metric contract.

- on_time_rate is 304 / 370 = **82.162162%**, but display **“Delivered-status share (proxy)”**. The denominator is the selected status set {delivered, delayed, exception}, not a proven set of completed, SLA-assessed deliveries.
- delay_rate is 66 / 370 = **17.837838%**, labeled **“Delayed/exception share (proxy)”**. It is not delayed_orders / total_orders.
- total_revenue_usd is the raw sum of order_value_usd, including canceled rows and without subtracting promotions. Display **“Raw order value”**, not recognized or net revenue.
- revenue_at_risk_usd is raw value in {delayed, exception}. It is exposure associated with those statuses, not a probability-weighted financial loss.
- Zero denominators produce null and an “N/A” explanation, not zero. Averages return their eligible count; ratios return numerator and denominator. Aggregate ratios from summed counts, never an average of group percentages.

There is no promised-delivery date, stock on hand, inbound purchase quantity, backorder position, or lead-time field. Do not infer SLA compliance, causal carrier performance, net sales, or a reorder quantity from absent data.

### Forecast policy

Forecast **recorded non-canceled units per product category per month**. This is a transparent proxy for demand, not latent demand corrected for stockouts. In-transit, delayed, and exception quantities remain included because the default is booked non-canceled demand, not completed sales. The excluded canceled quantity is seven units.

Use last-month naive and trailing-three-month mean baselines, with time-ordered evaluation. Twelve monthly bins provide weak evidence for generalization and annual seasonality; 355 SKUs across 400 rows make default SKU forecasts particularly hard to justify.

A manifest must distinguish observed dates from certified coverage. A last order on December 30 does **not** prove December is incomplete or complete. If coverage cannot be confirmed, any January–December complete-grid assumption must be explicitly recorded as a synthetic-demo assumption; results are exploratory and cannot support operational ordering. Do not silently convert missing ingestion periods into zero demand.

A 20% buffer may be shown as a user-visible scenario: ceil(sum of forecast units × 1.20). It is neither statistically calibrated safety stock nor an instruction to buy that amount. Zero demand remains zero. Prediction intervals and seasonality are deferred until data and evaluation can justify them.

## 5. Architecture and current stack

### Recommended topology

~~~mermaid
flowchart TD
    UI["React dashboard and Ask"] -->|Typed queries| API["Hono API: access and validation"]
    UI -->|Question| GUARD["Access and durable spend guard"]
    GUARD -->|One generation| ROUTER["Model router"]
    ROUTER --> VALID["Strict operation validation"]
    API --> DOMAIN["Metric registry and forecast functions"]
    VALID --> DOMAIN
    DOMAIN --> DB["D1: analytics tables"]
    GUARD --> BUDGET["D1: atomic usage state"]
    DOMAIN --> RESULT["Typed evidence and deterministic answer"]
    RESULT --> UI
~~~

The SPA and API share one Workers deployment and origin; analytics and budget tables share one small D1 database. They are separate modules, not separate services. The model gets the question, schema, permitted vocabulary, and time context—not the CSV or computed result rows.

Analytics functions have a read-only application interface. The Worker itself needs D1 writes for usage state; this is **not** a database-enforced read-only credential. No request handler accepts SQL, uploads, migrations, arbitrary URLs, or administrative commands.

### Technology choices

Versions are stable release lines checked on the audit date, not an already-tested lockfile. Resolve exact compatible patches at scaffold time, commit one package-lock.json, and use npm ci.

| Layer | Choice | Rationale / compatibility policy |
|---|---|---|
| Language | TypeScript 7.x, strict mode | Shared contracts across UI/API. If a required tool's compiler integration is incompatible, document a temporary TypeScript 6.x pin rather than silently mixing versions. [Release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| Build tooling | Node.js 24 LTS; Vite 8.1.x | Node is the local/CI toolchain, **not** the production Worker runtime. [Node releases](https://nodejs.org/en/about/previous-releases), [Vite release](https://vite.dev/blog/announcing-vite8-1) |
| UI | React 19.3.x; Recharts; ordinary CSS or optional Tailwind | SPA fits this interactive dashboard; SSR/SEO is not a stated requirement. Use a compatible stable chart release, not a copied floating reference version. [React versions](https://react.dev/versions) |
| API/runtime | Hono on Workers; Cloudflare Vite plugin | Small Web-API-based server and same-origin static assets. Verify the resolved Hono release and dependency graph; pin Wrangler and a tested compatibility date. [Hono guide](https://hono.dev/docs/getting-started/cloudflare-workers), [Vite integration](https://developers.cloudflare.com/workers/vite-plugin/) |
| Validation | Zod 4 strict objects; generated JSON Schema | One contract source, with an explicit adapter for the provider's supported schema subset. Server validation remains authoritative. [Zod 4](https://zod.dev/v4), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) |
| Data | D1/SQLite; SQL migrations and prepared statements | Relational aggregation plus durable quota state without another billed service. No ORM is needed for these few tables. [Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) |
| Tests | Vitest 4.1+ with @cloudflare/vitest-plugin; Playwright | Test Worker bindings in the actual local runtime, plus a small browser suite. Do not scaffold the older pool-workers integration from stale examples. [Current test setup](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/) |
| Model transport | Direct fetch to one active provider; Groq first, DeepInfra challenger in evaluation | Test each provider's schema and token controls. No gateway, agent framework, hidden retries or automatic paid fallback. See the setup guide's capability matrix. |
| CI/deploy | GitHub Actions, one build pipeline, Wrangler | PR checks without secrets; separately authorized release deployment. No paid monitoring service or duplicate hosting build pipeline initially. |

Workers' free CPU allowance is tight. Measure compiled schema validation, JSON handling, and forecast code under realistic concurrent requests before committing to the free tier. Local workerd tests establish compatibility, not production latency or quota headroom. Static assets should bypass Worker execution; API routes must never fall through to the SPA HTML response.

### Alternatives and switch triggers

| Option | Cost / operational shape | Decision |
|---|---|---|
| Static-only browser analytics | Hosting can be free; no protected server-held model key. | Useful as an offline/read-only fallback. Do not embed an API key to manufacture a “free AI” architecture. |
| Workers + D1 + React | One deployment, finite free compute/database quotas, external model metering. | Default for this greenfield, tiny dataset. Validate CPU headroom and regional latency. |
| One Python container serving the built React SPA; FastAPI + DuckDB + durable usage state | Northflank Sandbox is the first free container candidate; Cloud Run is a usage-based alternative. Use durable Postgres for counters on ephemeral hosts. | Use if the brief requires Python, valuable Python code exists, or Worker compatibility costs outweigh savings. Check the complete hosting matrix; do not assume local container files persist. |
| Next.js frontend + separate Python backend | Two runtimes, deployment surfaces, and cross-origin configuration. | Keep only for a concrete requirement; not the cost-first default. Vercel Hobby is limited to non-commercial personal use. [Terms](https://vercel.com/docs/plans/hobby) |
| Postgres / managed auth / queues / object store / enterprise semantic layer | Additional components, operations, and possible charges. | Add only when a requirement appears: concurrent ingestion, tenants, large files, long jobs, or governed shared metrics. |

For the Python fallback, DuckDB's [Python overview](https://duckdb.org/docs/lts/clients/python/overview) and [multiple-thread guide](https://duckdb.org/docs/lts/guides/python/multiple_threads) use conflicting wording about cursor handles and concurrent execution. Do not base correctness on an untested interpretation. Choose explicit serialization around initialization and execute/fetch, or independently owned connections to a persisted read-only snapshot; test the pinned version. Do not run DuckDB-specific SQL unchanged against SQLite.

## 6. Operating cost and cost controls

[SETUP_AND_COMPARISON.md](SETUP_AND_COMPARISON.md) is the authoritative provider/price matrix and setup guide. It distinguishes recurring free quotas, promotional credits, monthly minimums, deposits, service tiers, and gross token usage. Update it with the plan when selecting a model or changing limits.

| Decision | Current proposal | Evidence / implication |
|---|---|---|
| Hosting | Workers Static Assets + API + D1 Free | 100K dynamic requests/day, 10 ms CPU/invocation; D1 reads/writes/storage have separate limits. [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) |
| Paid hosting transition | Workers Paid, $5/month base plus overages | Measure CPU and account usage before choosing it. No upgrade has occurred. |
| First free model candidate | Groq GPT-OSS 20B | Explicit strict-schema support; documented Free quota 8K tokens/minute and 200K/day requires token-aware pacing. [Schemas](https://console.groq.com/docs/structured-outputs), [limits](https://console.groq.com/docs/rate-limits) |
| Paid challenger | DeepInfra Gemma 4 E4B | $0.02/M input and $0.10/M output; $0.05 for the nominal 1K-question workload. Model/schema fit remains untested. [Price](https://deepinfra.com/google/gemma-4-E4B-it) |
| Paid continuity option | Groq GPT-OSS 20B | $0.075/M input and $0.30/M output; nominal $0.1725/1K questions. Avoid a migration solely to save $0.1225/month. [Price](https://console.groq.com/docs/models) |
| Input/output reservation | 4,096 input + 512 total billable output tokens | Full instructions/schema and reasoning count. Verify exact provider controls; 200-output comparison assumptions are not enforced ceilings. |
| Application caps | 100 attempts/day; 1,000/month; $2/month paid model allowance | Each applies independently. Free provider pacing/token caps can admit fewer calls. |

Reserve conservatively in integer microdollars before a paid generation. The setup guide computes model-specific amounts at the current bounds: 461 for Groq 20B and 134 for DeepInfra Gemma E4B. At most one atomic conditional D1 update admits a call, advancing the relevant count, monetary and free-token reservations together. Uncertain admission means no model call. Retain reservations after failures or unknown outcomes; do not retry automatically.

For Groq Free, initially enforce one generation per 60 seconds globally and 180K reserved input-plus-maximum-output tokens/day. This is deliberately below the documented quota and allows 39 calls/day at maximum token size. A confirmed free route has zero monetary charge but still needs durable quota protection. Use a dedicated provider project/key; other account consumption may still cause throttling.

Confirm permitted data handling provider by provider. Groq exposes ZDR controls with documented exceptions for default retention; Gemini's free/paid data treatment differs. Do not infer data policy solely from whether an API is free or paid. [Groq data controls](https://console.groq.com/docs/your-data), [Gemini pricing/data treatment](https://ai.google.dev/gemini-api/docs/pricing)

Optimization order: keep dashboard/forecasts deterministic; use one bounded routing call and deterministic answer rendering; enforce counts/tokens/cost; measure before adding plan/prompt caching. A shared edge limiter is useful for abuse suppression, but Cloudflare's [rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) is not a global spend ledger.

For Python or another container runtime, the database backing the budget guard must be durable across restarts and shared by replicas. A read-only DuckDB snapshot may be bundled for analytics; ephemeral SQLite usage counters cannot enforce a durable cost ceiling. The setup guide compares Northflank, Cloud Run and paid-container/VPS alternatives.

## 7. Reliability, security, and reviewer value

The central invariant is: **the model selects an operation; application code owns permissions, SQL, arithmetic, and the presented numbers**. This is consistent with the least-functionality and bounded-consumption principles described by [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) and [OWASP Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/).

A prompt is not a security control. Enforce strict server schemas, known dimension values, bound parameters, maximum complexity, and a fixed outbound provider URL. Distinguish clarification, unsupported requests, invalid model output, and provider failure. Never show raw provider responses, secrets, or fabricated fallback answers.

Ship a reviewer-friendly dashboard and Ask screen with definitions, applied filters, data version, dates, eligible counts, result tables, query evidence, limitations, and readable error states. A plan panel exposes the interpreted query and bound parameters; it does not reveal chain-of-thought or claim numerical summaries were generated faithfully by a prompt.

Protect all analytical API routes by default until data-publication permission is established. A lightweight high-entropy reviewer access token exchanged for a short-lived secure session is adequate for a single-reviewer demo, not a substitute for production identity management. Do not bake a shared token into the JavaScript bundle. Logs should capture request IDs, status, timings, token counts, quota rejections, and data/model versions—not raw questions or data rows by default.

Release evidence must include exact data tests, query correctness, hostile-output rejection, concurrent budget tests, actual model-routing results, and browser/runtime smoke checks. Mock-only CI must remain free of external model calls. Forecast diagnostics must report small-sample limitations; no confidence level or forecasting accuracy is asserted in advance.

## 8. Scope and completion status

The authoritative build estimate, task dependencies, runnable command contract, scope cuts, and release gates are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). This is an implementation-ready proposal, not an assertion that the original assignment has been fully satisfied.

The earlier audit completed reference-source inspection and independent CSV checks. This rewrite preserved those findings, refreshed the recommended stack/providers, added the complete setup/comparison guide, and aligned the report and plan. It did **not** run the reference application's test suite, build a new application, measure Worker CPU or latency, evaluate a live model, provision infrastructure, or incur model-evaluation spend.

Remaining decisions are explicit: recover the brief, confirm data/coverage and redistribution terms, disclose any unpushed implementation, select a model by real evaluation, and approve any live paid deployment. Until those gates pass, claim “audited design and plan,” not “production-ready system.”
