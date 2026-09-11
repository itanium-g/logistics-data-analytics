# Spaceship Logistics Analytics — Cost-First Implementation Plan

Updated: 2026-09-11 (UTC). Status: **planned, not implemented**. This revision changes documentation only.

[deep-research-report.md](deep-research-report.md) owns audit evidence and analytical meaning. [SETUP_AND_COMPARISON.md](SETUP_AND_COMPARISON.md) owns the complete setup, current stack, hosting/LLM matrices, prices and provider selection. This plan owns scope, contracts, sequencing, estimates and release gates. Update shared decisions in the same change.

## Source links

- Original assignment brief and attachments: [Spaceship Senior Engineer Code Test](<https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24>)
- Answer/reference repository: [KhresnaPanduI/spaceship-logistics-analytics](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics>)
- Audited reference snapshot: [commit 1c1ee718](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3>)

The Notion page is the source of truth for exact requirements and attached files. The reference repository is evidence and architectural context; do not copy its code or data without permission.

## 1. Build target and non-goals

Deliver one React SPA plus Hono API on Cloudflare Workers with Static Assets, backed by one small D1 database. Use a strict metric registry, deterministic forecasts and answer templates, and at most one model generation per new natural-language question. Evaluate Groq openai/gpt-oss-20b on Free first, with DeepInfra google/gemma-4-E4B-it as the low-price challenger. Use one selected live provider, with no automatic paid fallback.

The default is a reviewer-gated demo, not an anonymous public paid endpoint or a production logistics platform. Preserve an entirely model-free dashboard and forecast form. A model outage must not remove access to valid deterministic analytics.

Target $0 hosting within free allowances; the model allowance is $2 per UTC calendar month, with lower per-request and request-count caps. Realized cost depends on usage and the evaluated model. No account creation, deployment, subscription, or paid evaluation is authorized merely by writing this plan.

Not in initial scope: SSR, multi-agent planning, raw text-to-SQL, RAG/embeddings, autonomous actions, uploaded datasets, multi-tenancy, OAuth/RBAC, queues, Redis/KV cache services, Kubernetes, paid monitoring, seasonal models, or an operational purchasing system.

If the original brief mandates Python, use one FastAPI container serving the same built SPA, with a read-only DuckDB analytics snapshot and a durable shared database for usage counters. Northflank Sandbox is the first free container candidate; Cloud Run is a usage-based alternative. Do not keep spend counters on ephemeral container disk or implement both backends. Document the selected path at G00 and revise the estimate if existing code or mandatory requirements materially change the work.

## 2. Evidence gates and scope

### G00 — requirements and data gate

Before substantive implementation, create docs/requirements.md with a row for each requirement, its source, acceptance test, and required/bonus/unverified status.

| Unresolved item | Required action | Safe default while unresolved |
|---|---|---|
| Original Notion brief and attachments | Recover and read them; map exact deliverables, deadline, required stack, submission instructions, and bonuses. | Continue only as a provisional implementation of the reconstructed brief; do not claim full rubric compliance. |
| Locally refactored or unpushed application code | Inspect existing workspace changes before scaffolding. | Latest inspected main e5a5e67 contains README, report and plan only; no application code reuse assumed. |
| Assigned data and redistribution rights | Obtain the authorized CSV; record provenance, license/terms, and whether data or results may be public. | No copied upstream application code or publicly exposed data. |
| Calendar coverage and field semantics | Confirm whether the file covers all of 2025 and what statuses/promotions mean. | Record unverified assumptions; forecasts stay exploratory. Do not assert operational validity. |
| Model data treatment and deployment permission | Select an allowed provider/project and verify account terms and quotas. | LLM_ENABLED=false; local mock mode; no paid calls or deployment. |

### Scope contract

| Priority | Included work | Release consequence |
|---|---|---|
| P0 — coherent submission | G00 record; typed ingestion; all metric contracts below; dashboard + Ask + forecast form; simple category forecast and buffer scenario; evidence panel; strict validation; access and durable cost guard; offline CI; real routing evaluation for live Ask; browser/runtime checks; README and honest AI disclosure. | Do not trade correctness, privacy, or budget controls for UI polish. A mock-only Ask is explicitly labeled and is not a live-AI submission. |
| P1 — only after P0 | Accessible visual polish beyond baseline, safe result export if required, additional evaluation paraphrases, measured/versioned plan caching, richer forecast sensitivity display. | Cut first when time is short. |
| P2 — requirement or evidence driven | Four-to-six-month forecasts, calibrated intervals, trend/seasonal models, Docker for the Worker path, persistent chat history, multi-step comparisons, uploads, production identity or multi-tenancy. | Add only with a separate estimate and acceptance criteria; promote if the brief actually requires it. |

Tests and ambiguity handling are P0 here because they protect the proposed system, even if the reference author described them as bonus topics. No unsupported forecast interval is required for P0.

## 3. Repository and dependency plan

Use one package.json and package-lock.json; npm ci in CI. Resolve stable compatible patches of TypeScript 7, React 19.3, Vite 8.1, Hono, Zod 4, Recharts, Wrangler, and the Cloudflare Vite plugin. Use Node 24 LTS for build tooling and the Worker runtime for API execution. Validate the full graph; a temporary TypeScript 6 pin requires a written compatibility reason.

Use Vitest 4.1+ with the current @cloudflare/vitest-plugin and Playwright. Generate Worker binding types from Wrangler. Pin the compatibility date, dependency patches, and CI action commit SHAs; avoid preview releases and moving model aliases. Sources, a proposed scaffold/configuration, local/remote database commands, secrets, deployment steps and version caveats are in the setup guide. Use that guide as the runbook; its commands are not yet implemented/verified in this repository.

The paths below are **files to create**, not files already present.

| Path | Responsibility |
|---|---|
| src/web/ | Dashboard, Ask, forecast form, charts/tables, accessible states; no secrets or business formulas. |
| src/shared/contracts.ts | Strict request/response schemas, canonical enums, and inferred TypeScript types. |
| src/domain/metrics.ts | Metric definitions, units, numerator/denominator expressions, allowed dimensions, descriptions. |
| src/domain/query.ts | Validated query compilation, ordering, full-scope summaries, and result metadata. |
| src/domain/forecast.ts | Pure series, baseline, evaluation, and buffer calculations. |
| src/domain/answer.ts | Deterministic answer text and chart/table hints from validated results. |
| src/worker/index.ts and routes/ | Hono routing, auth, body limits, errors, and request IDs. |
| src/worker/data.ts | D1 adapter exposing only the analytical operations the domain needs. |
| src/worker/router.ts and budget.ts | One active provider, tested schema conversion/token bounds, atomic monetary and free-token reservations; a small challenger adapter for evaluation. |
| scripts/import-data.ts | Offline CSV validation and deterministic seed generation; never an upload endpoint. |
| migrations/ and data/manifest.json | Versioned schema plus data provenance/checksum/coverage; raw data tracked only when permitted. |
| tests/unit/, tests/worker/, tests/e2e/ | Pure domain tests, local-runtime/D1 integration, browser journeys. |
| evals/ | Versioned development/held-out questions, expected plans, and separately generated real-model results. |
| docs/ and .github/workflows/ | Requirements, decisions, measured results, CI, and release instructions. |

Keep domain functions independent of Hono and provider SDKs. Use a narrow database boundary, not a speculative abstraction framework. SQLite date expressions are engine-specific: test them; do not paste DuckDB DATE_TRUNC or DATE_DIFF SQL.

## 4. Data and metric contract

### Import and manifest

Treat one row as one order only after validating unique order_id. Parse CSV with a real quoted-field parser; city values contain commas. Do not split lines on commas manually.

Validate the 17 expected columns, strict calendar dates, required identifiers/dimensions, enumerated status, positive integer quantity, decimal currency precision, promotion fields, and nullable delivery_date. Reject duplicates, invalid dates, non-finite values, negative money, and delivery before order; report row/field errors without silently dropping rows.

Parse money from decimal strings into integer cents. Require safe-integer arithmetic and SQLite integer storage; test USD formatting separately. Raw order value is authoritative for its metric; check quantity × unit price as a data-quality invariant for this fixture. Do not silently apply promo discounts.

Record source URL or assignment attachment, source Git blob when relevant, SHA-256 of the actual input bytes, import timestamp, schema/metric version, observed date bounds, coverage status, declared coverage if known, row count, and dimension vocabularies. IDs are opaque: do not derive dates from their “2026” substring.

Generate seeds offline. Seed development/test independently from any live database; use explicit environment targeting. Record the imported data version in D1. Never reset live usage counters as part of analytics data reload.

The pinned reference fixture must reproduce:

~~~text
rows = unique_order_ids = 400
delivered = 304; delayed = 55; exception = 11
in_transit = 27; canceled = 3
raw_order_value_cents = 1369587
status_exposure_cents = 238610
total_units = 1310; demand_units = 1303
observed_order_dates = 2025-01-01 .. 2025-12-30
~~~

These are golden values for that fixture, not values to force onto a different authorized dataset. Record and review any replacement dataset's differences.

### Metric registry

Every filter applies before aggregation. Status-qualified formulas below further restrict that selected scope. Count/sum over no eligible rows is zero; ratios with no denominator and averages with no eligible observations are null. Ungrouped queries return one aggregate row; grouped empty queries return no rows.

| Metric ID | Calculation over selected rows | Display / response semantics |
|---|---|---|
| total_orders | COUNT(*) | Orders, integer. |
| delivered_orders | Count status = delivered | Delivered-status orders; no SLA claim. |
| delayed_orders | Count status = delayed | Delayed-status orders; does not include exception. |
| in_transit_orders | Count status = in_transit | In-transit orders. |
| on_time_rate | delivered / (delivered + delayed + exception) | Delivered-status share (proxy); fraction 0–1 plus numerator/denominator. |
| delay_rate | (delayed + exception) / (delivered + delayed + exception) | Delayed/exception share (proxy); fraction 0–1 plus numerator/denominator. |
| avg_delivery_days | Mean UTC calendar-day difference for rows with delivery_date | Days plus eligible count; no imputation for missing dates. |
| total_revenue_usd | Sum raw order_value_cents, all selected statuses | Raw order value; integer value with unit = usd_cents. |
| revenue_at_risk_usd | Sum order_value_cents where status is delayed or exception | Status-associated exposure; integer value with unit = usd_cents. |
| total_units | Sum quantity, all selected statuses | Recorded units, integer. |
| demand_units | Sum quantity where status != canceled | Non-canceled recorded units; forecast target. |

Retain the reference metric IDs for traceability; do not hide the corrected display meanings. All USD values cross the API as cents and are divided by 100 only for presentation. Percent values cross as fractions and are multiplied by 100 only for presentation. Unit tests must catch both common 100× errors.

Dashboard status distribution is total_orders grouped by status, including all five statuses. KPIs and chart presets compile through this registry. A top-client chart may project raw value, issue rate, and count in one grouped query; it must not redefine those expressions locally.

### Query schema and execution

Use strict objects with no unknown properties, including nested objects. Provider JSON-schema conformance does not replace Zod parsing and domain validation.

| Field | Allowed values / limit |
|---|---|
| metrics | 1–3 distinct registered metric IDs. |
| breakdown | None or one of carrier, region, product_category, warehouse, client_id, destination_city, status. |
| time_grain | none, day, week, month, year; calendar dates in UTC, week starts Monday. |
| date_from / date_to | Both omitted or both valid YYYY-MM-DD; inclusive order_date bounds; from <= to. |
| filters | At most 5, combined with AND; distinct fields; allowed dimension fields only. |
| filter operator/value | eq with one nonempty string; in with 1–20 distinct strings; max 100 characters per value; values must resolve to the manifest vocabulary. |
| order_by | Default period ascending then group ascending; or one selected metric ascending/descending for a non-time grouped ranking. |
| limit | Integer 1–100; default 20. Fetch one extra group to identify truncation. |

Normalize only documented aliases/case; unknown or ambiguous values produce clarification, not guessed matches. Reject null, booleans, arrays, objects, and wrong primitive types where not explicitly allowed. No arbitrary expressions, joins, filenames, URLs, SQL fragments, OR trees, or model-supplied identifiers.

Build SQL identifiers and aggregate expressions exclusively from trusted maps, and bind all user values. Use one compiler for dashboard presets and Ask. Rate calculations must force non-integer division. Test Monday/year-boundary buckets independently of the production implementation.

Rank **after full aggregation, before LIMIT**, with a stable group tie-break and null metric values last. Return total_groups, returned_groups, truncated, and full-scope summary statistics. If another query is needed for full-scope totals, bound it explicitly. Do not infer the total from the first 20 rows, sum averages, or average percentages.

For P0, do not combine top-N ranking with a time-series breakdown: ask for either a ranked total or a trend. Distinguish ranking by raw value from ranking by rate. Show denominators and warn about small groups; no causal “best carrier” conclusion.

Omitted dates mean all available data. Out-of-range explicit dates return an honest empty result, not a silently shifted window. “Last month” without an anchor asks whether the user means calendar time or the latest dataset month. “Latest month in the dataset” may resolve from the manifest. Supply the runtime UTC date to the router; forecasts always show their historical as-of date.

## 5. API and model boundary

### Endpoints to implement

| Endpoint | Behavior | Access / model usage |
|---|---|---|
| GET /api/health | Minimal process health; no secrets or dataset details. | Public; zero model calls. |
| POST /api/session | Exchange a manually supplied high-entropy reviewer token for a short-lived signed session. | Strict Origin/body checks and burst control; zero model calls. |
| DELETE /api/session | Clear the session cookie. | Same-origin; zero model calls. |
| GET /api/meta | Metric descriptions, allowed vocabularies, data version and coverage. | Reviewer session; zero model calls. |
| POST /api/query | Execute the strict query contract. | Reviewer session; zero model calls. |
| POST /api/forecast | Execute the strict category forecast contract. | Reviewer session; zero model calls. |
| POST /api/ask | Interpret one question, validate one decision, execute, render evidence. | Reviewer session + durable budget guard; zero or one model generation. |

The dashboard uses bounded query presets; it does not need separate handwritten SQL endpoints for each chart. The UI may batch a small fixed number of requests; never let the model choose unbounded batch size. Unknown /api routes return JSON 404, not index.html.

Responses use a discriminated envelope with kind = query, forecast, clarify, unsupported, or error; include request_id and schema/data versions where applicable. Query/forecast results include canonical plan, typed rows/series, units, warnings, deterministic answer, timings, and evidence. Return only safe error codes and user-facing messages.

Use HTTP 400 for malformed JSON, 401 for missing/expired session, 403 for origin/access rejection, 413 for body size, 422 for invalid user contracts, 429 for usage limits, and 502/503/504 for provider failure/unavailability/timeout. A valid natural-language question that needs clarification or is outside supported capability is a normal typed result, not fabricated data.

### Routing protocol

1. Trim question; require 1–1,000 characters and enforce a 16 KiB request-body limit before JSON parsing. Reject unexpected fields and content types.
2. Authenticate and check configured feature state. Mock mode returns conspicuously labeled fixtures; it never pretends a live model answered.
3. Build compact instructions/schema from the registry, manifest vocabulary, data bounds, and runtime clock. Do not send CSV rows or result tables.
4. Make at most one generation for a strict decision object: query_metric, forecast, clarify, or unsupported. The latter two execute no analytics. They use safe reason codes and server-rendered prompts, not unrestricted model prose.
5. Use structured JSON output for the routing object, with the provider-supported schema subset generated from the contract. For Groq strict mode, all properties must be required and objects reject additional properties; normalize a tested nullable representation of optional fields back into the canonical domain contract. Verify the exact challenger model's support. No tool execution, search, code interpreter, URL context, or provider grounding is enabled.
6. Parse an object only; reject multiple decisions, arrays, null, truncation, unknown names/keys, invalid enum values, and malformed arguments. A future native-function-calling adapter must reject multiple tool calls rather than taking the first.
7. Revalidate in application code and execute only the permitted deterministic operation. Return the canonical interpretation so a reviewer can see a wrong-but-valid model selection.
8. Build all numerical prose from result fields and full-scope summaries. No second model call and no chain-of-thought display.

Separate provider schema validity from semantic correctness. Parameterized SQL prevents injection through values; it does not make a wrongly selected metric correct. That distinction is why live evaluation is a release gate.

## 6. Forecast contract

Input: one known product_category, horizon_months integer 1–3, and optional buffer_pct in 0–50 (default 20). Method selection is deterministic, not a model-chosen mathematical formula. SKU-level and reorder-quantity requests are unsupported with an explanation.

Build category-month SUM(quantity) excluding canceled orders. Use the manifest's explicit coverage grid, not an inferred current year. Zero-fill category gaps **only within coverage accepted as complete**. If complete 2025 coverage is merely a demo assumption, record it in the manifest and return coverage_unverified on every forecast. Otherwise use only certified complete months, and report excluded partial periods.

For a 12-month accepted grid:

- Candidate A: repeat the final observed monthly value.
- Candidate B: repeat the trailing-three-month mean.
- Select by mean absolute error on four expanding-window one-step folds: train January–June and predict July, then August, September, and October. Ties choose naive.
- Freeze that choice; evaluate November and December with expanding history. Report these two held-out absolute errors and the naive comparator separately from selection errors.
- Refit the selected method on all accepted history and project the requested next months. With ten or eleven accepted bins, run only available folds and report zero or one holdout respectively; do not invent missing validation months. With fewer than ten accepted bins, default to naive and report insufficient history for this evaluation scheme.

Report actual fold counts and dates; two holdouts are weak evidence, not a reliable estimate of long-horizon accuracy. Do not claim success solely from an in-sample R². Avoid MAPE on zero demand; MAE is in units. Missing trustworthy coverage prevents claims about operational forecast quality.

Keep full precision internally; show point estimates with appropriate decimal formatting. Compute buffered_demand_units = ceil(sum(unrounded_forecast) × (1 + buffer_pct/100)). All-zero input yields zero, not a forced one-unit order.

Response: history, forecast, units, selected method, as_of, forecast dates, coverage status, evaluation diagnostics, buffer assumption, and buffered-demand scenario. Display “not a purchase recommendation”; stock, inbound orders, backorders, and lead time are unknown. No P0 confidence interval or promised service level.

## 7. Access, abuse prevention, and bounded spend

### Demo access

Generate a high-entropy reviewer token out of band; store it only as a Worker secret. Do not use a human password or put the token in VITE_* variables, code, URLs, logs, or localStorage. Exchange it for a signed, expiring cookie: Secure, HttpOnly, SameSite=Strict, API-scoped path; support logout and secret rotation. Use a timing-safe verification approach and test tampering/expiry.

This is deliberately a small shared-reviewer access mechanism. If named users, revocation per user, or sensitive production data are required, replace it with an appropriate identity service as newly scoped work.

Validate same-origin requests on state-changing endpoints, including JSON content type and CSRF protection appropriate to cookie auth. CORS is not authentication. Apply a CSP and other appropriate response headers; escape model/user text, and never render untrusted HTML.

Keep all data APIs protected unless G00 explicitly permits public data. Static assets contain no raw CSV. Provider/D1 secrets and deployment tokens remain server-side and scoped; there are no database-admin or seed endpoints.

### Proposed limits

| Setting | Default | Enforcement |
|---|---:|---|
| Request body / question | 16 KiB / 1,000 trimmed characters | Before parsing / before provider access. |
| Query complexity | Section 4 limits; maximum 100 returned groups | Strict schema and compiler; no free-form SQL. |
| Provider input | 4,096 tokens including system instructions and schema | Verify the complete request bound with supported counting or a tested conservative method, not characters ÷ 4. The previous 8,192 cap exceeds Groq Free's 8K TPM. |
| Provider output | 512 total billable tokens | Configure and verify model-specific output/thinking behavior; refuse activation if not bounded. |
| Provider timeout / automatic retries | 15 seconds / 0 | Abort signal; no hidden SDK retry or silent model fallback. |
| Advisory burst control | 5 Ask requests per minute per session/IP key | Edge limiter; HMAC identifiers, not raw IP logging. Not a billing counter. |
| Generation attempts | 100 per UTC day and 1,000 per UTC month globally | Durable atomic conditional state update. |
| Model allowance | $2 per UTC month globally | Conservative microdollar reservation before paid generation; confirmed free mode has zero monetary charge. |
| Groq Free pacing | One generation per 60 seconds globally | Durable next-allowed timestamp; not a per-instance counter. |
| Groq Free tokens | 180,000 reserved tokens per UTC day | Reserve verified input plus maximum billable output; independent of monetary and request caps. At maximum input/output, this admits 39 calls/day. |
| Local/mock behavior | LLM_ENABLED=false | No network model access in default tests or development. |

Use one durable budget-state row and an atomic conditional UPDATE/UPSERT that checks and advances daily/monthly counts, monetary reservations where applicable, free-token reservations, and pacing time together. Never do read-check-write in separate requests. Derive period keys server-side, test rollover, and reject stale-period races rather than resetting newer counters backward. Maintain application-wide paid caps across model changes; do not reset spent allowance when selecting another provider. Free-provider quota checks must use the relevant provider/configuration.

Reserve against the versioned rates and verified bounds in the setup guide: 461 microdollars per paid Groq 20B call or 134 per DeepInfra Gemma E4B call at 4,096 input / 512 total output. Use exact scaled arithmetic and round up. A confirmed free call still consumes request/token quota. GPT-OSS low reasoning does not disable reasoning; hiding it does not waive billing. If output truncates or a provider cannot enforce the bound, do not activate that configuration. A new model/bound requires updated price configuration and evaluation.

If the reservation write fails, times out, or its success is uncertain, **do not generate**. If a generation times out, returns invalid output, or has an unknown billing outcome, retain the reservation. For this small demo, never refund reservations; reconcile actual usage for reporting only. Stop when either count or monetary allowance would be exceeded. Duplicate user retries consume another reservation; disable UI double-submission and do not automatically retry.

This deliberately trades some unused allowance for safety and simplicity. A rate limiter, browser counter, Worker global variable, or eventually consistent KV record cannot enforce the global dollar bound. The database write binding is for the budget module; the analytical adapter never executes model-supplied writes.

Log request ID, outcome, timings, model ID, reported token usage, and reserved microdollars. Do not log raw questions, tokens, or rows by default. Set short retention and sample successful logs. Provider alerts supplement the application cap; they do not guarantee a hard bill ceiling. Use a dedicated provider project/key so unrelated usage does not bypass this application's accounting.

### Caching policy

Serve fingerprinted assets with appropriate long-lived cache headers. Keep reviewer analytics caching private and short-lived, keyed by canonical query and data/metric version; no shared CDN caching of authenticated results. Browser memory caching is enough initially.

P1 model-plan caching must key normalized question, authorization scope, model/prompt/schema/metric/data versions, and applicable date context; use a bounded TTL, revalidate cached plans, and never cache failures or secrets. Do not add Redis/KV or explicit provider prompt caching without a measured cost/latency case.

## 8. Execution sequence and effort

Estimates are **focused engineering hours**, not a deadline or a claim about AI productivity. They assume one developer comfortable with React/TypeScript, the reconstructed P0 scope, an available authorized dataset, and no major compatibility surprise. Tests are written with each feature, not postponed to the final phase.

| Phase | Work and dependency | Hours | Exit gate |
|---|---|---:|---|
| P00 | Brief/data/permission decision record; identify existing work. | 2–4 | G00 recorded; unresolved items have explicit safe behavior. |
| P01 | Scaffold locked stack, local Worker/D1, shared contracts, and offline CI. After P00. | 3–5 | Clean install, typecheck, build, and one real-runtime test pass. |
| P02 | Import contract, manifest, migrations/seeds, golden data checks. After P01. | 4–6 | Exact fixture facts and invalid-row tests pass; no live-data mutation. |
| P03 | Registry, safe query compiler, ranking, ratios, full-scope evidence. After P02. | 6–9 | Independent numerical and malicious-input tests pass. |
| P04 | Deterministic API and simple forecast/backtest/buffer behavior. After P03. | 5–8 | Typed API and forecast edge cases pass without a model. |
| P05 | Groq adapter, small DeepInfra challenger adapter, schema conversion, mock cases and held-out evaluation harness. After P03. | 5–8 | Wrong/malformed decisions fail safely; no claimed live accuracy. |
| P06 | Reviewer sessions, durable cost/free-token reservations, pacing, token bounds, failures and concurrency. After P04/P05. | 5–8 | No unreserved generation; access and budget tests pass. |
| P07 | Dashboard, Ask, forecast form, evidence panel, accessible responsive states. After API contracts stabilize. | 6–9 | Core browser journeys pass; no client-side metric duplication. |
| P08 | Authorized real-model evaluation, remote quota/CPU smoke, release docs and rollback check. After P06/P07. | 5–8 | All applicable release gates below pass with recorded evidence. |
| **Base total** | **P00–P08** | **41–65** | **5.125–8.125 eight-hour person-days.** |

Add 20% contingency: **49.2–78 hours**, or approximately **6.2–9.8 eight-hour person-days**. The extra 1–2 base hours versus the previous estimate cover a second provider adapter for comparison. External waiting for the brief, permissions, accounts, or review is not included. Re-estimate after P01 if the Worker stack is unfamiliar or the brief expands scope. P1/P2 work is not included.

If time is cut, remove P1/P2, reduce the number of dashboard charts, and shorten the demo narrative. Do not remove money/date correctness, access controls, durable caps, core tests, or disclosure. If live evaluation cannot be completed, ship a clearly labeled deterministic/mock prototype only if the assignment permits that reduced scope.

## 9. Test strategy and acceptance evidence

The commands below are a **script contract to implement in P01**, not commands that currently exist in this documentation-only repository:

~~~sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:worker
npm run build
npm run test:e2e
~~~

The normal suite has model networking disabled. A separate npm run eval:live is manual, budgeted, and requires permitted inputs and configured credentials. No real model call runs on every PR or on untrusted fork code.

| Gate | Required evidence | Pass condition |
|---|---|---|
| G01 Data | Independent golden calculations and negative fixtures. | 400-row reference truths match exactly in counts/cents; replacement-data differences documented. |
| G02 Metrics | All registry metrics; all/empty/status-filtered scopes; multi-metric projections. | Correct eligible counts/null semantics; dashboard and Ask agree for identical canonical plans. |
| G03 Query safety | SQL-injection strings; unknown values; wrong primitives; extra fields; invalid dates; Monday/year boundaries; top-N ties/truncation. | Forbidden inputs never reach execution; results match independent expected aggregates. |
| G04 Provider boundary | Mock arrays/null/multiple decisions, unknown metric, oversized output, truncation, timeout, 429/5xx. | Safe typed failure; no second generation, hidden retry, or fabricated answer. |
| G05 Forecast | Quantity vs order count; canceled rows; missing/partial periods; zeros; short history; rolling folds; rounding. | No leakage, no artificial minimum-one buffer, correct units/dates, coverage warnings and weak-evidence labels. |
| G06 Access and spend | Missing/tampered/expired session; secret in built assets; Origin/CSRF tests; concurrent paid/free requests; UTC rollover and pacing; provider switch without budget reset; uncertain DB/provider outcomes. | Unauthorized access blocked; no generation without a confirmed reservation; caps cannot be overspent by races under configured bounds. |
| G07 Live routing | Held-out real-provider evaluation described below. | Selected model satisfies the declared routing thresholds; publish observed counts, failures, tokens, latency and cost. |
| G08 Browser/runtime | Desktop/mobile, keyboard paths, loading/empty/error/clarify/unsupported, stale dataset label, provider-off mode, deep links, /api JSON 404. | Reviewer can complete the core journeys; no leaked secrets/data; API-only routing works. |
| G09 Release | Clean checkout run, dependency/security review, measured runtime fit, authorized deployment, readiness, versioned docs, rollback exercise. | No unresolved critical correctness/security issue; evidence matches the deployed commit and data version. |

### Real-model evaluation protocol

Maintain separate development prompts and a frozen held-out set. Start with 60 held-out questions: 40 supported, 10 ambiguous, and 10 unsupported/adversarial. Include metrics, multi-filter values, rankings, date interpretation, category forecasts, absent SLA/stock questions, and attempts to request arbitrary SQL or extra operations.

Manually define acceptable canonical plans or clarification/rejection outcomes before testing; do not use the same model as the sole judge. Normalize equivalent filter/metric ordering and documented defaults, but require correct metric, scope, dates, grouping, sort, and forecast category/horizon. A valid JSON response alone is not a correct answer.

For each candidate, run one budgeted pass against the same frozen set. Proposed release thresholds are **at least 38/40 correct supported plans, 10/10 correct ambiguity handling, and 10/10 safe unsupported/adversarial outcomes**. Also require deterministic guard tests to reject every forbidden execution. These finite-set thresholds are project targets, not a promise of 95% production accuracy.

Report one-run counts and failure examples. After selecting or tuning a model/prompt, run a second held-out confirmation set of the same size; do not repeatedly tune on the reported holdout. Keep raw responses private if they contain sensitive content; checked-in evidence may use hashes and redacted failure cases.

Begin with Groq openai/gpt-oss-20b and DeepInfra google/gemma-4-E4B-it. Prefer free Groq if it passes and quota/latency fit. For paid access, compare measured cost per successful task and integration effort; the nominal paid-model difference is only $0.1225/1,000 questions. If neither passes, improve development cases or evaluate a separately budgeted comparator such as Gemini 2.5 Flash-Lite; do not lower thresholds or add a silent premium fallback. Record model/version, provider, prompt/schema, pricing mode and all billable output.

Initial two-model comparison plus one confirmation is up to 180 generations. If all Groq calls are paid, the more expensive confirmation is Groq: 120 × 461 + 60 × 134 = 63,360 microdollars, or **$0.06336** conservatively reserved at the current bounds. Free Groq lowers cash consumption but remains subject to its pacing/token quota. Allocate **$1 maximum for the initial evaluation exercise**, including these runs, with no automatic reruns or escalation. Deposits are separate cash commitments; no spend was incurred by this documentation rewrite.

Use the same admission logic in a separately targeted evaluation environment with a one-off ceiling of 180 generations and $1, distinct from the demo's $2/month allowance. Provider limits are account-scoped: aggregate evaluation and demo usage if they share a quota, or keep live Ask off while evaluating. At maximum tokens a 60-case Groq Free pass needs more than one UTC day under the proposed 180K daily reservation. Never reset/bypass counters or create accounts to evade limits. Record evaluation and interactive usage separately when reporting total cost.

### Runtime measurement

Record Worker CPU separately from end-to-end network latency. Suggested demo targets: measured p95 CPU below 8 ms to leave margin under the 10 ms Free limit; p95 deterministic API response below 750 ms and Ask below 10 seconds from the intended reviewer region. These are provisional budgets, not measured results or service-level guarantees.

Exercise cold/warm paths, at least 100 representative bounded requests, and a small authorized concurrency burst. Inspect actual CPU limits, D1 rows read/written, bundle size, and errors. Fix measured inefficiencies first; if Free cannot fit, request an explicit $5 Paid upgrade or use the agreed fallback. Do not silently increase billing or promise free-tier uptime.

## 10. CI, release, rollback, and handoff

CI begins in P01. On pull requests: npm ci, formatting/lint/type checks, offline domain/runtime tests, production build, and a small browser suite. Cancel superseded runs, cache package downloads, and keep runs short enough for the account's included minutes. Review dependency audit findings rather than blindly applying breaking fixes.

Pin third-party actions to reviewed commit SHAs, set minimal workflow permissions, and never expose deployment/provider secrets to pull-request code. Separate any deployment workflow from validation; deployment requires the repository's normal approval policy. Do not enable both provider builds and Actions deployment for the same commit.

Before an authorized release:

1. Freeze the selected model, prompt/schema/metric versions, dependency lockfile, data manifest, and release commit.
2. Validate provider prices, token caps, project data terms, and hosting account allowances again. Keep live Ask disabled if any check fails.
3. Apply reviewed migrations to the explicitly selected environment; seed analytics data without resetting budget state. Confirm the data checksum and golden aggregates.
4. Deploy one same-origin application. Verify health, authenticated readiness/data version, all core journeys, correct headers, and no secrets or raw CSV in public assets.
5. Enable live Ask, free or paid, only after G06/G07 pass. Observe quota state, one permitted request, failure behavior, and measured resource use.
6. Record rollback: disable Ask first for cost incidents; redeploy the last known-good Worker. Keep database migrations backward-compatible; restore/reseed analytics only through a reviewed procedure and never roll budget counters backward.
7. Capture README run/deploy instructions, model-off behavior, limitations, cost settings, test/evaluation reports, architecture decisions, and the final requirement matrix.

Write AI_USAGE.md from actual work: prior ChatGPT research, the user's reported local Kiro refactor, this audit/refactoring, and any later assistants used. Record exact tools/model IDs only when known from logs; do not infer a provider's official model identity from a nickname. Give real examples of generated files/functions and human verification. Do not copy the reference author's claims about tools, ownership, or tests.

Reviewer demo, approximately five minutes: show data scope and proxy definitions; filter the dashboard; ask a ranked question and inspect its plan/denominator; request a category forecast and explain units/coverage/buffer; show an ambiguity or unavailable-data response; demonstrate that deterministic analytics remain usable when Ask is disabled.

**Done means:** applicable G00–G09 evidence exists, the deployed version matches it, required disclosure and submission instructions are satisfied, and remaining limitations are visible. At this revision, only the documentation audit is complete; application tasks and release gates remain unexecuted.
