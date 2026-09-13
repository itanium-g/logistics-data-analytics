# Spaceship Logistics Analytics Implementation Plan

Updated: 2026-09-13 UTC. **Implemented and verified locally. Not deployed, and the live model route has not been evaluated.** Phases P00 to P05 are complete with the evidence recorded in section 9 and in [README.md](README.md#verification-performed); P06 is partially complete: focused checks and the README are done, deployment and live evaluation are not.

Build the supplied assignment within its **6–10 hour** expectation: five required KPIs, at least two charts, live AI routing, SKU demand forecasting for four months, evidence for each answer, and a public review URL. The previous 41–65 hour plan described a much larger hardening project and is superseded as the submission baseline.

[Requirements](docs/requirements.md) maps the brief to acceptance evidence. The [source catalog](docs/assignment/README.md) records the supplied files and Notion/reference links. [Data audit](docs/data-audit.md) records facts and assumptions. [Setup and comparison](SETUP_AND_COMPARISON.md) owns provider research and the future setup runbook. [Submission checklist](docs/submission-checklist.md) tracks the handoff.

## 1. Decisions and scope

Use one React SPA and Hono API on Cloudflare Workers Static Assets, one D1 database, and one live model provider. All dashboard, query, forecast and answer arithmetic stays in deterministic application code. The model selects one analytical operation through validated structured input.

| Decision | Submission baseline | Reason and tradeoff |
|---|---|---|
| Stack | TypeScript, React, Hono, Zod, Recharts, Workers and D1 | Any stack is permitted. Preserve the existing cost-first architecture; no separate frontend/backend hosting or ORM. |
| Hosting | Workers and D1 Free, subject to measured fit | Target $0 within quotas. A paid upgrade is a later decision if limits prevent a stable review. |
| LLM | Evaluate Groq openai/gpt-oss-20b Free first | One adapter; no automatic paid fallback. A second provider is optional follow-up. |
| Access | Public demo using only the supplied synthetic sample; no login by default | Authentication is optional. Credentials are N/A for this profile. This does not authorize real customer uploads. |
| Data | Offline import of the supplied CSV into read-only analytical tables | No runtime upload/edit/delete endpoint. The separate usage table may be updated by the quota guard. |
| Forecast | Known SKU, 1–4 months, quantity-based moving average | Four months is an explicit example. Sparse history changes the warning and baseline, not support for known SKUs. |
| Inventory | Numerical buffered demand coverage target with visible assumptions | Net purchase quantity requires unavailable stock, inbound supply and lead-time data. |
| Delivery semantics | Version 2 status proxies, with exceptions separate | No promised-delivery date exists. Distinguish observation from assumption. |

| Priority | Work | Treatment |
|---|---|---|
| P0 | Five KPIs, two charts, filters, dynamic chart selection, evidence table, live Query/Forecast routing, SKU four-month forecast, inventory target, README, disclosure and public URL | Required submission scope. |
| P0 engineering support | Strict validation, safe SQL compilation, free quota guard, useful errors, basic responsive/keyboard usability, focused tests and live smoke evaluation | Chosen means of delivering the required behavior, not additional employer requirements. |
| P1 | Category forecast selector, extra KPIs/charts, browser query history, export, richer ambiguity UX and expanded tests | Only after P0 works; cut first when time is short. |
| P2 | Second provider and 180-call comparison, paid ledger, reviewer sessions, extensive backtests, calibrated intervals, Docker, automated browser suite and production identity | Separate estimates after submission. |

The brief explicitly lists history, caching, tests, Docker, advanced explainability and ambiguity handling as optional bonuses. Basic evidence remains mandatory. Do not add SSR, RAG, vector search, multi-agent frameworks, queues, Redis, Kubernetes, multi-tenancy, uploads or purchasing automation.

## 2. Requirements gate G00

G00 is **complete for source review**, not for application behavior. All four supplied files were read. The coding brief and specification PDF were visually inspected. The CSV's Git blob matches the pinned reference fixture. Remote baseline da1d4a4 has four Markdown documents and no application source.

| Item | Resolved fact or planning assumption |
|---|---|
| Stack | Any technology; PostgreSQL and listed frameworks are examples. |
| Effort and deadline | 6–10 hours expected; no submission deadline/date supplied. |
| Deliverables | Repository, public deployed URL, README, credentials only if authentication is used. |
| AI disclosure | The important notes require disclosure; record actual assistance in AI_USAGE.md. |
| Dataset | 400 rows, 17 columns, 355 SKUs; inspected from supplied attachments and cataloged in docs/assignment/README.md. Originals are not committed. |
| Coverage | Assume January–December 2025 is a complete synthetic observation window. This is not proved by the brief or last order. Forecasts return coverage_unverified. |
| Status meaning | delivered is the on-time proxy; delayed is the late proxy. Exceptions have unknown outcome and are excluded from these rate denominators. These are project assumptions. |
| Live readiness | Account eligibility, quota, deployment and model behavior remain unverified. None is activated by this documentation update. |

Do not reopen the resolved brief/data acquisition tasks solely because Notion was unavailable in an earlier review. Revisit new material conflicts, actual provider readiness, or newly supplied code.

## 3. Build sequence and time budget

These are focused allocation targets for a developer familiar with the stack, not a guarantee. Existing accounts and a working toolchain are assumed. Record actual effort and compatibility/access delays honestly.

| Phase | Planned work | Hours | Exit evidence |
|---|---|---:|---|
| P00 | Confirm attached-source decisions and freeze scope | 0.25–0.50 | Requirements matrix understood. |
| P01 | Scaffold, local Worker/D1, lockfile, import and manifest | 0.75–1.25 | Validated fixture totals and clean build. |
| P02 | Five KPIs, bounded query compiler and date/filter semantics | 1.00–1.50 | Independent totals, null cases and date-basis checks. |
| P03 | Dashboard, two charts, filters and reusable evidence/table view | 1.00–1.50 | Responsive core view; all values agree. |
| P04 | SKU forecast, history/future chart and inventory target | 0.75–1.25 | Four months, sparse warning, units and rounding checks. |
| P05 | One AI adapter, strict routing, quota admission and failures | 1.00–1.75 | Both tools execute safely from validated decisions. |
| P06 | Focused checks, small live evaluation, README, deploy and browser smoke | 1.25–2.25 | Acceptance evidence and reachable URL; no exposed secrets. |
| **Total** | **P00–P06** | **6.00–10.00** | **Small complete submission, subject to verification.** |

This planning audit is already complete; the allocations describe the future build. At hour 6, freeze additions and reserve the remaining time for correctness, live routing, deployment and README. Never cut below two charts or remove the required forecast path. If a must-have remains broken at hour 10, state the extra effort rather than declaring completion.

The earlier 41–65 hours (49.2–78 with contingency) included custom sessions, multiple providers and extensive hardening. Those are not hidden dependencies of this baseline. Estimate selected P2 work separately.

## 4. Repository and dependency plan

Resolve compatible stable patches of React 19.3, Vite 8.1, TypeScript 7, Hono, Zod 4, Recharts and Wrangler at scaffold time. Node 24 LTS is the build toolchain; APIs run on Workers. Use one package.json and lockfile. A TypeScript 6 pin is acceptable if compiler integrations need it; record the reason rather than spending the timebox on a migration. Primary sources are in the setup guide.

These paths now exist and hold the implementation:

| Path | Responsibility |
|---|---|
| src/web/ | Dashboard, Ask, forecast, charts/tables and shared evidence view. |
| src/shared/ | Strict request/response contracts, dataset constants, errors and the runtime-neutral `SqlDb` port. |
| src/domain/ | Pure metrics, safe query compilation, date interpretation, forecast and deterministic answers. |
| src/data/ | Persisted manifest access, CSV validation and deterministic seed generation. |
| src/worker/ | Routes, D1 adapter (`db.ts`), one provider adapter and quota admission. |
| scripts/import-data.ts | Quoted-field CSV validation and deterministic seed generation. |
| migrations/ and data/manifest.json | Analytics/usage schema and provenance. |
| tests/ and evals/ | Focused checks, frozen live cases and actual results. |

The implementation follows this layout: `src/domain/` has no dependency on the Worker environment, `src/shared/db.ts` defines the SQL port, and `src/worker/db.ts` supplies the D1 adapter. The data/bootstrap modules live under `src/data/` so scripts, tests and Worker routes share them without presenting persistence code as domain logic.

Import the user-supplied mock_logistics_data.csv from an explicit local input path and verify its checksum. Original source files are not committed in this update. Keep generated seeds, local database state, secrets and compiled output out of Git. Do not create a second competing source dataset.

## 5. Data and metric contract

### Import

Validate the 17 columns, unique order_id, real ISO dates, enums, positive integer quantity, required identifiers, nullable delivery_date, promotion fields and non-negative decimal money. Use a real CSV parser because cities contain commas. Reject invalid rows with row/field diagnostics; do not silently drop or repair them.

Parse currency into integer cents and check integer arithmetic. Raw values equal quantity × unit price in this sample. Do not subtract promo discounts silently or label gross order value net revenue. IDs containing 2026 are opaque; use date columns.

Record SHA-256, row/schema counts, observed date bounds, assumed coverage/status, enums, import timestamp and data/metric versions. Seed only through local/admin deployment tooling. Reloading orders must not reset usage counters. Exact independent totals are in docs/data-audit.md.

### Metrics

Apply all filters first. Ratios return numerator/denominator; averages return eligible count. Empty counts/sums are zero; absent denominators/observations produce null with an explanation.

| Metric | Formula within selected scope | Fixture result and label |
|---|---|---|
| total_orders | Count unique order_id after import enforces uniqueness | 400 orders. |
| delivered_orders | Count status = delivered | 304 delivered-status orders. |
| delayed_orders | Count status = delayed | 55 delayed-status orders; exception is separate. |
| on_time_rate | delivered / (delivered + delayed) | 304/359 = 84.68%; “On-time delivery rate (status proxy)”. |
| avg_delivery_days | Mean delivery_date − order_date in calendar days, for dated delivered or delayed rows | 1,324/359 = 3.69 days; “Average delivery time (delivery-status records)”. |

Supporting delay_rate = delayed / (delivered + delayed) = 55/359 = 15.32%. Exceptions, in-transit and canceled are excluded from the rate denominator. Exact SLA compliance is unavailable; a proxy answer must expose this assumption.

Version 2 deliberately replaces the prior reference proxies: on-time 304/370 = 82.16%, issue rate 66/370 = 17.84%, and all-dated mean 1,417/370 = 3.83 days. Preserve those facts in the audit, but do not mix formulas in dashboard and Ask. Exceptions do not establish lateness.

Optional metrics: in_transit_orders, total_units, demand_units (quantity excluding canceled), raw order value, and delayed/exception-associated value exposure. Currency crosses the API in cents, percentages as fractions. Financial charts are not a dependency of the five required KPIs.

### Query and chart rules

| Field | Submission subset |
|---|---|
| metrics | 1–3 distinct registered IDs; no arbitrary formulas. |
| breakdown | None or carrier, region, product_category, warehouse, client_id, destination_city, status, sku. |
| time_grain | none, day, week or month; Monday week starts. |
| date_field | order_date default; delivery_date for delivery-event questions. |
| date_from / date_to | Both absent or real inclusive YYYY-MM-DD bounds, from ≤ to. |
| date_context | Explicit dataset or current mode resolved by server rules below. |
| filters | Up to 5 AND filters on known dimensions; eq or in with 1–20 bounded known values. |
| order_by / limit | Selected metric for non-time ranking or chronological order; limit 1–100, default 20. |

Compile identifiers/expressions from trusted maps; bind every value. Reject unknown fields, wrong primitive types, SQL, joins, URLs, multiple operations and invalid enums. Rank after full aggregation and before limit, with stable ties and null rates last. Return total_groups, returned_groups, truncated and full-scope summaries. Do not average rates or sum averages.

For P0, reject combined time-series/top-N ranking and ask the user to choose a trend or ranking. A group filter changes eligible rows; return counts so small denominators and degenerate status-filtered rates remain visible.

Deterministic chart selection: time series → line; category/carrier/status ranking → horizontal bar; scalar → card with evidence summary. Chart and table share the same rows. Required dashboard charts: monthly order volume and all-five-status counts. Do not label all exceptions “late”.

### Date interpretation

Calendar dates are not local timestamps. Show the selected date context beside Ask and echo concrete bounds/date_field in every result.

- Dataset mode is the demo default, with reference date 2026-01-01 immediately after assumed coverage. “Last month” means December 2025; “last 3 months” means October–December 2025, the last three complete calendar months.
- Current mode uses runtime UTC and the last complete calendar month(s). Out-of-sample results remain empty; do not silently shift them to 2025.
- Explicit dates override relative dates. Conflicting/unresolvable expressions require clarification.
- Order trends and delayed-order cohorts default to order_date. “Delivered late last month” uses delivery_date with the delayed-status proxy, not a contradictory delivered AND delayed filter.
- delivery_date filtering excludes missing dates and reports eligibility. Dashboard cards/charts share their selected date/filter scope.
- “Next four months” in forecasting means the four months after historical coverage_end: January–April 2026. Display the historical as-of date; do not call these current forecasts in September 2026. Explicit starts after the historical gap are unsupported in P0.

## 6. Forecast and inventory contract

Input: scope = sku, exact known SKU, horizon_months integer 1–4 (default 4), buffer_pct 0–50 (default 20). Category scope is P1. Forecast recorded non-canceled quantity, never order count or revenue.

1. Build January–December 2025 monthly quantities. Zero-fill SKU gaps only under the stated complete-synthetic-window assumption; return coverage_unverified.
2. Sparse SKU: repeat the mean of all 12 monthly quantities for each future month. This 12-month moving average includes observed zero months and does not invent a launch date.
3. With at least six non-zero months, use a trailing-three-month mean. This is a declared heuristic, not a statistically selected winner. At most three rows occur per SKU in this sample, so every SKU uses the sparse branch.
4. Return sample row count, non-zero months, history, forecast, method, units, as-of date, date range, filters and warnings. Unknown SKU → clarification/unknown value; known zero-demand scope → zero forecast.
5. coverage_target_units = ceil(sum(unrounded forecasts) × (1 + buffer_pct/100)). Round once after summing; expose base forecast, buffer and target separately.

Acceptance example: CRAYON-0008 has seven non-canceled units over 12 assumed months. Each of January–April 2026 forecasts 7/12 units. Four-month demand is 7/3 units; the 20% buffered target is ceil(2.8) = **3 units**.

Suggested output: “Plan coverage for 3 units over January–April 2026 under this baseline and 20% buffer; compare this with usable stock and inbound supply before ordering.” Provide a numerical inventory recommendation with limitations. Do not imply a net purchase order, calibrated safety stock, service-level guarantee or latent demand estimate.

Chart history and forecast together with a clear boundary and distinct future styling; include a table. Twelve sparse monthly observations do not establish accuracy. P0 makes no confidence-interval, accuracy or backtest claim. Time-ordered MAE/naive comparison and richer category baselines are follow-up work.

## 7. API and AI boundary

| Future endpoint | Behavior |
|---|---|
| GET /api/health | Minimal process health. |
| GET /api/meta | Metric definitions, filter vocabulary, sample coverage and version. |
| POST /api/query | Validated deterministic analytics. |
| POST /api/forecast | Validated deterministic SKU forecast. |
| POST /api/ask | Interpret one question, validate one tool decision, compute and render evidence. |

No session endpoints are needed for the public synthetic-demo profile. If a gate is later chosen, supply working credentials in the handoff and keep them out of Git. Analytical functions expose no writes; quota writes use their own table and code path.

Decisions are query_metric, forecast, clarify or unsupported. Use strict provider JSON output, then application parsing/domain validation. Normalize provider-required nullable fields without weakening the canonical schema. The server dispatches the decision to a Query or Forecast function; native tool-calling and streaming are unnecessary.

Send only the question, compact contract, date context and necessary vocabulary. Do not list all 355 SKUs in every prompt: pass literal SKU candidates found in the question and validate membership server-side. Do not send CSV rows or computed results. A missing SKU can request clarification and offer the UI selector.

Allow one generation per question. Reject arrays, null, extra keys, unknown tools, invalid arguments, truncation and multiple decisions. All numerical prose comes from result fields, not another generation. A valid but semantically wrong plan is still a routing failure.

Each computed response includes canonical plan, metrics/dimensions, date field/bounds/context, assumptions, warnings, data/metric version, rows/summary, units and chart hint. A plan panel exposes interpretation, not chain-of-thought.

Distinguish bad input, unknown value, unsupported capability, no data, rate limit, outage and timeout. Unknown /api routes return JSON 404, never SPA HTML. Provider-off mode preserves direct dashboard/forecast access, but cannot satisfy the live-AI requirement.

## 8. Cost and request controls

Use a confirmed free model route. Paid generation is disabled; no automatic top-up or fallback. Verify actual account limits before activation. Hosting and D1 have independent limits.

| Control | Baseline |
|---|---|
| Body / question | 16 KiB before parsing / 1,000 trimmed characters. |
| Complete model input | 4,096 tokens including schema, using verified counting or a tested conservative bound. |
| Total output | 512 billable tokens including reasoning; verify accounting and truncation. |
| Timeout / retries | 15 seconds / zero automatic retries. |
| Free pacing | One generation per 60 seconds globally; show retry-after. |
| Request caps | 100 attempts/day and 1,000/month; token guard can admit fewer. |
| Free tokens | 180,000 input-plus-maximum-output tokens/day. |
| Activation | LLM_ENABLED=false until free-route checks and live acceptance pass. |

One atomic conditional D1 admission update advances counts, token reservations and pacing. Do not use separate read/check/write or instance-local counters. Uncertain/failed admission means no generation; retain reservations after failures. Check concurrent requests for the final slot and UTC rollover. Coordinate reviewer/evaluation calls against account-wide quota.

At 4,608 reserved tokens/call, the profile admits 39 calls/day. Twenty acceptance calls consume at most 92,160 tokens. Minute pacing means roughly 20 minutes, included in P06, rather than an overnight 180-call dependency.

Keep secrets server-side, check browser POST origins, use restrictive headers and render untrusted strings as text. Origin checks are not authentication. Avoid logging raw questions or source rows. Anonymous free Ask can be exhausted; show a clear unavailable state while preserving deterministic features.

P2 paid activation requires a reviewed reviewer gate and atomic monetary reservations at verified prices/bounds. The setup guide retains the former $2/month ceiling and microdollar arithmetic for that optional profile; it is not active.

## 9. Acceptance evidence

Gate status as executed on this machine. "Met" means the check ran and the result was observed; the reproduction commands are in [README.md](README.md#local-setup).

| Gate | Status | Evidence |
|---|---|---|
| G01 Data | **Met** | Source SHA-256 verified at import; 400 unique rows, 17 fields, every control total in the data audit reproduced independently. The importer refuses to emit output if any control disagrees. |
| G02 Analytics | **Met** | Five KPI results to full precision, empty and null-denominator cases, dashboard/Ask parity through shared domain functions, full-scope ranking before truncation, and denominators exposed on every ratio. |
| G03 Query safety | **Met** | Unknown keys and values, bad dates, SQL-like inputs in value and identifier positions, and extra or multiple model operations all rejected with the dataset intact. |
| G04 Forecast | **Met** | Sparse known SKU, four months, the exact CRAYON-0008 result of 3 units, unknown SKU, zero demand, canceled exclusion, and rounding once after summing. |
| G05 Live AI | **Not met** | 20 cases frozen in `evals/cases.json` with expected plans and facts, defined before any run. They have not been executed against a provider. Passing them against a stubbed transport does not satisfy this gate. |
| G06 Quotas and errors | **Partially met** | Token bounds, concurrent admission, UTC rollover, timeout, 429, outage and truncation behaviour, and the absence of any paid fallback are all verified locally. The free route itself is unconfirmed because no account has been used. |
| G07 Browser and runtime | **Partially met** | Five cards, two charts, Ask panel, SKU forecast, date labels, empty/error/model-off states, keyboard reachability and JSON API 404 verified through a jsdom mount test and 13 workerd smoke checks. Real-device and deployed-browser checks are outstanding. |
| G08 Handoff | **Partially met** | Clean-checkout instructions executed successfully; README, disclosure and credentials state are complete. There is no public URL and reviewer repository access is unverified. |

Use 12 supported, 4 missing/ambiguous-input and 4 unsupported/adversarial live cases. Include all three quoted analytics examples, two SKU/four-month variations, filters, ranking, date basis and empty ranges. Define acceptable plans before execution. Require all 20 expected outcomes for the declared subset and no forbidden execution; publish counts rather than claiming general 100% accuracy.

If tuning is needed, keep failures as regressions and confirm with fresh equivalent cases within quota. Record added time. Mock-only evaluation does not pass G05. Two-provider 60-case holdouts remain P2.

Executed script contract: `npm ci`; `npm run data:import`; `npm run db:migrate`; `npm run db:seed`; `npm run typecheck`; `npm test`; `npm run build`; `npm run smoke`. Ordinary tests never call a model: the routing tests substitute the HTTP transport. A live evaluation runner is not implemented, so `npm run eval:live` does not exist; the frozen cases would be executed manually against an enabled provider. Lint and CI were not added.

## 10. Release and handoff

Deployment is future work. Freeze lockfile, data checksum, metric version, provider/model and deployed commit. Seed the selected environment without resetting usage. Use one deployment path and scoped secrets; no provider keys in browser bundles or Git.

Test the public URL from a fresh session: filters, live analytics, four-month SKU forecast, tables, JSON API 404 and provider failure. Measure actual CPU/resources; local checks do not establish free-tier performance.

README must contain actual tested setup/environment variables, architecture/data flow, tool routing, assumptions, unsupported queries, future work, AI disclosure and live URL. If authentication is chosen, provide credentials through the handoff channel; otherwise state “Not required”.

Rollback: disable Ask for quota/provider incidents, restore the previous working deployment, and preserve provenance and usage counters. Restoring data must not restore old budget state.

Complete docs/submission-checklist.md with repository, deployed URL, access, revision and checks. The repository is private; verify reviewer access at handoff without silently changing visibility.

**Done means:** required features work on the deployed revision with acceptance evidence. The application is implemented and locally verified against gates G01 to G04, with G06 and G07 partially met. Deployment, live model evaluation and employer submission remain pending, so this is not yet done by that definition.
