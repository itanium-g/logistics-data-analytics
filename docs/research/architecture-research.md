# Spaceship Logistics Analytics Research and Architecture

Research baseline: 2026-09-11 UTC. **Supplied requirements verified; application is implemented and the release process is recorded separately.** Historical research and original analytical findings are retained below; current evidence is linked separately.

The supplied assignment supports the existing low-cost TypeScript architecture, but changes the delivery scope. Build one small public demo with five KPIs, two charts, live Query/Forecast routing, a four-month SKU forecast and numerical inventory target. The 6–10 hour expectation takes priority over the former 41–65 hour hardening backlog.

[Implementation plan](../architecture/implementation-plan.md) owns current contracts and sequencing. [Requirements](../requirements.md) maps the source brief. [Historical comparison](historical-comparison.md) preserves the provider survey. [Data audit](../data-audit.md) owns independently calculated fixture facts.

Current implementation evidence: [README](../../README.md#verification-performed), [frontend behavior](../frontend-redesign.md) and [current screenshots](../screenshots/README.md). The research and original analytical findings below are retained as historical context; current package pins and setup commands come from the implementation. No vendor research was rerun for this documentation refresh.

## 1. Evidence and source authority

| Evidence | Establishes | Limitation |
|---|---|---|
| [Supplied coding assignment](docs/assignment/README.md#original-files) | Numbered requirements, bonuses, rubric, 6–10 hour expectation and submission items. | No deadline or prescribed KPI formulas. |
| [PDF](docs/assignment/README.md#original-files) and [Word specification](docs/assignment/README.md#original-files) | Corroborating core requirements; four-page PDF. | Shorter specification does not repeat the bonus list. |
| [Supplied CSV](docs/assignment/README.md#original-files) | Observable data facts and exact bytes. | No SLA dates, stock, lead times or coverage guarantee. |
| [Notion source](https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24) | User supplied the landing-page text and linked files. | No fresh Notion retrieval is claimed in this update. |
| [Reference revision](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3) | Earlier audit's independent code/architecture comparison. | Not the assignment authority or permission to reuse application code. |
| [Target baseline da1d4a4](https://github.com/itanium-g/logistics-data-analytics/tree/da1d4a408c80ebcd462acd5c89b17a325a5316af) | Four Markdown documents, no app source. | No working app, test run or deployment. |
| Vendor documentation in the setup guide | Earlier provider research and selected current stack/Workers/Groq checks. | Not a fresh exhaustive provider sweep, tested lockfile or account-readiness result. |

All four user-supplied files were read, and the coding brief and specification PDF were visually inspected. Source filenames and hashes are recorded in the [source catalog](docs/assignment/README.md). The supplied CSV has SHA-256 b60f84b18aacc1a76b6d401ba0c290a0efd1f2729734224d65608e941594bc82 and Git blob dc20411f5b37c57af46f2ae42c0802d5a19d0ea9, identical to the earlier reference fixture.

Source review is resolved; original files remain user-supplied inputs rather than repository content. Coverage/status semantics and provider readiness remain explicit assumptions or future checks. No reference code is copied; no open-source license for supplied assignment materials is inferred.

## 2. Changes required by the supplied brief

| Finding | Implication | Current decision |
|---|---|---|
| Category-only forecasting and 1–3 month horizons excluded the supplied SKU/four-month example | The planned subset omitted a prominent expected journey. | Known SKU forecasts for 1–4 months are P0. Sparse data produces warnings and a simple baseline. |
| Prior baseline estimated 41–65 hours | It over-scoped the 6–10 hour assignment. | One provider, small acceptance set and no default login; extended hardening deferred. |
| Every query used order_date | Delivery-event questions could be numerically wrong. | Allowlist order_date and delivery_date; state the chosen basis. |
| Exceptions counted as lateness | Data does not establish late delivery for exceptions. | Metric v2 separates exceptions and exposes all denominators. |
| Relative questions against old data lacked a reviewer-friendly resolution | Silent re-anchoring would be misleading; current dates often return empty results. | Explicit dataset/current date context, shown before asking and in evidence. |
| Inventory output risked becoming only a disclaimer | The brief requires an inventory recommendation. | Return a numerical demand coverage target, method and unavailable-stock limitations. |
| Original source access was still marked unresolved | Planning unnecessarily depended on an obsolete retrieval gate. | G00 source review complete; functional gates remain pending. |
| Deployment/handoff was not concretely tracked | A repository alone does not satisfy the submission. | Checklist for public URL, private-repo access, credentials if needed and deployed revision. |

The brief permits any stack. PostgreSQL, Python and Docker are not mandatory. Query history, caching, tests, Docker, advanced explainability and ambiguity handling are optional bonuses. Basic filters/metrics/data evidence is required. The rubric is 15% Product & UX, 15% Frontend, 20% Backend & Architecture, 20% Data Correctness, 15% AI Orchestration, 10% Forecasting and 5% Deployment.

## 3. Verified data and analytical meaning

| Check | Observed value |
|---|---:|
| Rows / columns / unique order IDs | 400 / 17 / 400 |
| Order-date range | 2025-01-01 through 2025-12-30 |
| Delivered / delayed / exception | 304 / 55 / 11 |
| In-transit / canceled | 27 / 3 |
| Dated records | 370 |
| Raw order value / delayed-or-exception value | USD 13,695.87 / USD 2,386.10 |
| Total units / non-canceled units | 1,310 / 1,303 |
| SKUs / categories | 355 / 8 |
| SKUs appearing once / twice / three times | 313 / 39 / 3 |

Counts, dates and exact decimal monetary totals were independently computed. Order IDs contain 2026 although the dates are 2025; IDs are opaque. A CSV parser must handle commas inside quoted city fields.

### Delivery metric version 2

The employer names KPIs without defining formulas. The selected assumptions are delivered = on-time proxy and delayed = late proxy, with unknown exception outcomes excluded.

| Metric | Calculation | Fixture result |
|---|---|---:|
| On-time delivery rate, status proxy | delivered / (delivered + delayed) | 304/359 = 84.68% |
| Delay rate, status proxy | delayed / (delivered + delayed) | 55/359 = 15.32% |
| Average delivery time, delivery-status records | Mean dated delivered/delayed calendar-day duration | 1,324/359 = 3.69 days |

These are not exact SLA measurements. The prior reference definitions remain valid for different quantities: delivered share 304/370 = 82.16%, issue share 66/370 = 17.84%, all-dated mean 1,417/370 = 3.83 days. Do not mix those exception-inclusive formulas with v2 labels. A null denominator yields N/A, not zero.

December 2025 has four delayed-status delivery events by delivery_date but three delayed-status order cohorts by order_date. Therefore the late-deliveries example must use the delivery date and disclose the proxy assumption. Under v2, GLS has the highest carrier late share, 2/7 = 28.57%, with a small-denominator warning and no causal claim.

Raw order value is not recognized/net revenue. Value on delayed/exception records is associated exposure, not expected financial loss. These extra financial metrics are optional.

### Forecast and inventory

SKU forecasts use recorded non-canceled quantity and show sparse-history limitations. Assume January–December 2025 is the complete synthetic observation grid, record assumed coverage separately from observed dates, and return coverage_unverified. Zero-filling is conditional on that assumption.

The sparse SKU baseline repeats the mean of 12 monthly quantities. CRAYON-0008 has seven units, giving 7/12 per month for January–April 2026. The visible 20% buffer produces ceil((7/3) × 1.2) = **3 units** of demand coverage.

Return that numerical planning target with history/future visualization, data table, method, dates, sample size and assumptions. Stock, inbound supply, lead times and backorders are missing, so the target is not a net purchase order or calibrated safety stock. Do not invent accuracy, confidence intervals or present a historical forecast as current September 2026 advice.

## 4. Architecture and decision comparison

~~~mermaid
flowchart TD
    UI["Dashboard and Ask"] --> API["Validation and routing"]
    API -->|Direct tools| DOMAIN["Query and Forecast functions"]
    API -->|Natural language| QUOTA["Durable free quota guard"]
    QUOTA --> MODEL["One model endpoint"]
    MODEL --> CHECK["Validated tool decision"]
    CHECK --> DOMAIN
    QUOTA --> DB["D1 orders and usage"]
    DOMAIN --> DB
    DOMAIN --> RESULT["Computed answer and evidence"]
    RESULT --> UI
~~~

One Worker deployment serves React and Hono on the same origin. D1 holds analytics and separate quota state. Analytical functions expose only reads; the Worker binding can write usage state, so this is an application boundary rather than a database-enforced read-only credential.

Use trusted expression maps and bound values, strict schemas and known enums. The model receives a question, compact schema, date context and necessary vocabulary, not CSV rows or results. Validate exactly one decision and compute the answer. For SKU questions, resolve literal candidates server-side instead of inserting all 355 IDs into every model prompt.

| Option | Main tradeoff | Decision |
|---|---|---|
| React + Hono + Workers + D1 | One deployment with small fixed data; CPU and account quotas require checking. | Selected low-cost design. |
| Static-only app | Cheap deterministic analytics, but cannot protect a server-held model key. | Does not alone satisfy the live AI backend path. |
| FastAPI container serving React + read-only data snapshot | Familiar Python tooling, with container/persistence operations. | Reconsider if existing useful Python code appears or Worker setup costs too much time. |
| Separate Next.js and Python services | Two runtimes and deployment surfaces. | No current requirement justifies the extra setup. |
| Postgres/auth/queues/vector database | More services and operational scope. | Add only for concrete later needs. |

Retain compatible stable React 19.3, Vite 8.1, TypeScript 7, Hono, Zod 4 and Node 24 LTS build tooling as the setup target. Resolve/test exact patches and commit the lockfile during implementation. A TypeScript 6 compatibility pin is acceptable when integrations require it. Build-tool versions do not establish a verified application.

## 5. Cost and reliability

The default profile targets **$0 within quotas**, with Groq openai/gpt-oss-20b Free as the first router candidate. Workers Free lists 100,000 dynamic requests/day and 10 ms CPU per invocation; Paid has a $5 monthly minimum. These are vendor limits, not measured fit. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

Groq documents strict structured-output support for GPT-OSS 20B and free limits including 8K tokens/minute and 200K/day. The application still needs semantic validation and actual account checks. [Structured outputs](https://console.groq.com/docs/structured-outputs), [rate limits](https://console.groq.com/docs/rate-limits)

The plan bounds complete input to 4,096 tokens and total output to 512, reserves free quota atomically, admits at most one generation/minute globally and uses no hidden retry or paid fallback. At maximum size the 180K daily application reservation permits 39 calls. Public Ask can exhaust free quota; the dashboard and direct forecast remain available.

P0 uses a 20-case live acceptance check, roughly 20 minutes under pacing, rather than a 180-call multi-provider experiment. No model has been evaluated yet. Keep paid models, the former $2/month ledger and custom reviewer sessions in an optional profile. The setup guide preserves their comparison arithmetic and limitations.

Measure Worker CPU separately from network latency during the future deployment. Keep secrets server-side, report failures clearly, and use scoped provider/deployment credentials. No public write/upload/admin endpoints, arbitrary model SQL, model-written numerical summaries or unrestricted provider tools are planned.

## 6. Earlier audit findings retained

The earlier research revision preserves the prior reference audit and source links. Its useful principles remain:

- Use units rather than order counts for inventory forecasts; allow zero recommendations.
- Separate mock integration checks from live routing evidence.
- Reject multiple/malformed tool decisions instead of executing the first.
- Aggregate and rank before limiting; expose full-scope totals and group denominators.
- Share metric definitions across dashboard and Ask.
- Distinguish source dates, certified coverage and assumptions.
- Bound paid usage durably if paid access is later introduced.
- Separate recurring free allowances, trial credits, deposits and actual consumption in cost comparisons.
- Prefer measured evidence to subjective scores or claims of production readiness.

The earlier report's unavailable-source statements, category-only scope, exception-inclusive KPI defaults and extended timebox are superseded by this revision. No old audit statement is presented as a fresh run of the reference application's tests.

The implemented source layout now keeps pure analytics in `src/domain/`, runtime-neutral contracts and the SQL port in `src/shared/`, persisted-manifest and import/bootstrap code in `src/data/`, and Cloudflare-specific adaptation in `src/server/`. The public Worker entrypoint is `src/server/index.ts`.

## 7. Completion status

Completed: review of all supplied files, data/hash checks, requirement mapping, revised scope, metric/date/forecast decisions, source provenance, application implementation, local typecheck/tests/build/smoke, source-layout refactor and documentation alignment.

Pending: live model evaluation, infrastructure setup, deployment, reviewer-access check and employer submission. Use the [submission checklist](docs/submission-checklist.md) and [AI disclosure](AI_USAGE.md). No deployment or paid action was performed.
