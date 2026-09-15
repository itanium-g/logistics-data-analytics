# Assignment requirements and acceptance matrix

Reviewed: 2026-09-15 UTC. **Source review complete; application implemented, merged into `main`, deployed and production-validated.** The deterministic paths are operational; the limited live Workers AI result and screenshot-capture limitation are recorded in [Current status](#current-status), [README verification](../README.md#verification-performed) and [capture limitations](screenshots/README.md#review-limits).

C refers to [Coding_assignment.docx](assignment/README.md#original-files) using its own numbered sections. S refers to [logistics-spec.pdf](assignment/README.md#original-files) page numbers; the supplied Word specification corroborates it. N refers to the landing-page text supplied by the user. [The source catalog](assignment/README.md) records exact files and hashes.

“Required” means the brief requires it. “Recommended” and “optional” preserve the source's distinction. “Project choice” means our implementation policy. Neither a design nor this checklist establishes that the feature works.

## Required features and handoff

| ID | Source | Classification | Requirement | Planned acceptance evidence |
|---|---|---|---|---|
| R01 | C §§1–3; S p1 | Required | Full-stack application with dashboard and natural-language interfaces sharing one dataset | Both paths use one imported data version and common computation functions. |
| R02 | C §4.1; S p1 | Required | Total orders, delivered orders, delayed orders, on-time delivery rate, average delivery time | Five cards match independent fixture calculations and visible definitions. Missing SLA semantics are disclosed as proxies. |
| R03 | C §4.1; S p1 | Required | At least two dashboard charts | Monthly order volume and status counts render from computed rows with matching tables. Listed chart examples are choices, not a requirement for all three. |
| R04 | C §4.2; S p2 | Required | Interpret natural-language analytical questions and return answers, charts or both | Live cases for delayed-by-week, highest carrier delay rate and late deliveries last month. |
| R05 | C §4.3; S p2 | Required | Select and render an appropriate chart dynamically for a defined subset | Line for temporal series, bar for grouped/ranked data, scalar card for one number. |
| R06 | C §4.4; S p2 | Required | Filters, metrics/dimensions and underlying table or summary for every answer/chart | Shared evidence panel on dashboard, Ask and forecast, including dates, basis, units and assumptions. |
| R07 | C §4.4; S p2 | Recommended; included | Query plan or structured interpretation | Validated canonical plan shown; no chain-of-thought. |
| R08 | C §4.5; S p2 | Required | Provided data, read-only use, correct aggregation/filtering | Checksum and import checks; request paths cannot mutate orders; query/forecast parity checks. |
| R09 | C §§5,5.2; S p2 | Required | AI routes/orchestrates and never supplies uncomputed factual answers | One validated decision selects a deterministic function; numerical text is rendered from results. |
| R10 | C §5.1 A; S p2 | Required | Query Tool for analytics, aggregation and KPIs | Shared metric registry/query executor used by both dashboard and Ask. |
| R11 | C §5.1 B; S p2 | Required | Forecast Tool based on historical data and a basic method | Known SKU quantity series produces computed future values. |
| R12 | C §5.1 B; S p2 | Explicit example; included in required subset | Predict SKU demand for the next four months | A known SKU returns four monthly outputs, with exact dates and sparse-history warnings. A category-only or 1–3-month-only implementation is inadequate for this chosen subset. |
| R13 | C §5.1 B; S p2 | Required | Forecast values, historical/future visualization, inventory recommendation and methodology | One response contains all four, including numerical coverage target and stock/lead-time limitations. |
| R14 | C §6; S p3 | Required | Publicly accessible stable app, usable without local setup | Fresh-browser check of deployed URL, direct tools and live AI; deploy failures are not excused by a repository alone. |
| R15 | C §§6,16; S pp3–4; N | Conditional required | Test credentials if authentication is used | Baseline has no login; record “Not required”. If changed, verify and provide credentials without committing secrets. |
| R16 | C §6; S p3 | Required | No committed secrets | Source and built-bundle review; environment example uses placeholders. |
| R17 | C §8; S p3 | Stack freedom | Any stack; listed languages, frameworks and PostgreSQL are examples | TypeScript/Workers/D1 is allowed; no Python/Postgres mandate invented. |
| R18 | C §9; S p3 | Architecture guidance; adopted | Validate AI queries and separate interpretation, computation and business logic | Structured contract, allowlisted query compiler, bound values and separate domain functions. |
| R19 | C §§10–11; S p3 | Required | Repository and README with setup/environment variables | Actual clean-checkout steps tested after implementation; no phantom working commands. |
| R20 | C §11; S p3 | Required | README system overview, design decisions and data flow | Architecture diagram/prose agrees with implemented system. |
| R21 | C §11; S p3 | Required | README question interpretation and tool selection | Query/Forecast routing described with working examples. |
| R22 | C §11; S p3 | Required | README assumptions, simplifications, limitations, unsupported queries and future work | Data/SLA/forecast assumptions visible; unsupported cases fail honestly. |
| R23 | C §§12,15; S p3 | Scope constraint | 6–10 hours; simple correct work prioritized over completeness/polish | Small timeboxed plan; actual effort recorded; optional hardening is separate. |
| R24 | C §15; S p3 | Required disclosure | Disclose AI assistance | AI_USAGE.md reflects actual research/planning and later coding assistance; linked in README. |
| R25 | C §§10,16; S pp3–4; N | Required | Submit repository link, deployed app URL, credentials if required | Completed handoff checklist, repository access and deployment revision verified. |

## Optional bonuses

All entries below come from C §14. The shortened specification does not repeat this list.

| ID | Bonus | Decision |
|---|---|---|
| B01 | Query history | P1 browser-only history after required paths work. |
| B02 | Caching | P1/P2; no extra service for this dataset. |
| B03 | Tests | Small targeted checks included to protect correctness; broad automation is optional. |
| B04 | Docker setup | P2; not required for the Workers deployment. |
| B05 | Advanced explainability | P1/P2; basic required evidence is already P0. |
| B06 | Handling ambiguous queries | Basic safe clarification included; elaborate conversational follow-ups are P1. |

## Evaluation weights

| Category | Weight | Planned focus |
|---|---:|---|
| Product & UX | 15% | Clear questions, evidence, assumptions and usable error states. |
| Frontend | 15% | Five cards, two charts, dynamic visualization, responsive table access. |
| Backend & Architecture | 20% | Validated contracts, read-only data boundary and shared domain logic. |
| Data Correctness | 20% | Status/denominator rules, date basis, exact counts and quantity-based forecasts. |
| AI Orchestration | 15% | Live routing to both tools with no uncomputed numerical answers. |
| Forecasting | 10% | Four-month SKU baseline, historical/future plot and inventory target. |
| Deployment | 5% | Public usable URL and accurate setup/handoff. |
| **Total** | **100%** | Source: C §13 and S p3. |

## Examples and semantic decisions

These are deterministic acceptance expectations under the plan's declared assumptions, not live model results.

| Question / context | Canonical behavior | Expected sample fact |
|---|---|---|
| Show delayed orders by week for the last 3 months; dataset mode | delayed_orders, order_date, 2025-10-01 through 2025-12-31, Monday weeks | Weekly groups sum to 10; show requested bounds even if a boundary week starts earlier. |
| Which carrier has the highest delay rate? | delay_rate by carrier, descending, full aggregation before limit | GLS: 2/7 = 28.57% under metric v2; show its small denominator. |
| How many orders were delivered late last month?; dataset mode | delayed status, delivery_date, 2025-12-01 through 2025-12-31 | 4, with the late-status assumption. Filtering order_date would incorrectly answer 3 for this delivery-event question. |
| Predict demand for SKU CRAYON-0008 for the next 4 months | Forecast quantity after 2025-12-31 using sparse 12-month mean | January–April 2026: 7/12 units each; default buffered coverage target 3 units. |
| How much inventory should I plan?; no SKU supplied | Ask for a SKU and state default horizon/buffer | No fabricated number or silently selected product. |
| What is the exact on-time SLA rate? | Explain missing promised dates and offer the labeled status proxy | Exact SLA measurement unavailable. |
| Last month; current mode in September 2026 | August 2026, without silently shifting to the dataset | Empty scope, with dates shown. |

Status labels, dataset date anchoring, exception exclusion, coverage completeness, sparse-forecast method and buffer percentage are **project choices**, not employer-defined facts. The [data audit](data-audit.md) and [implementation plan](architecture/implementation-plan.md) own their definitions.

## Current status

Requirement outcomes as executed on this machine. The reproduction commands are in [README.md](../README.md#local-setup).

The source layout was also checked against the adopted architecture: pure analytics remains under `src/domain/`, shared contracts and the SQL port under `src/shared/`, data/bootstrap code under `src/data/`, and platform adapters under `src/server/`. This is a maintainability refactor; it does not change the API contract or analytical results.

| Requirement | Status |
|---|---|
| R01, R02, R03, R05, R06, R07, R08, R10 | **Met and verified locally.** Five KPIs at 400 / 304 / 55 / 84.68% / 3.69 days, two charts with matching tables, deterministic chart selection, a shared evidence panel on every result, a validated plan panel, and one shared metric registry and query executor used by both the dashboard and the question path. |
| R04, R09 | **Implemented; verified against a stubbed transport and a limited production probe.** All four operations route correctly in tests and every number is rendered from a computed field. The production probe returned `422 unsupported`, so live routing accuracy is not claimed. |
| R11, R12, R13 | **Met and verified locally.** A known SKU returns four monthly values with exact dates, a history and future chart, a numerical coverage target of 3 units for CRAYON-0008, the methodology, and the stock and lead-time limitations. |
| R14 | **Met.** The application is publicly deployed at https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev and the deterministic API/UI passed production validation. |
| R15 | **Not applicable, recorded.** No authentication in this profile, so credentials are "Not required". |
| R16 | **Met and verified.** No secrets in the repository or the built bundle; the environment example uses placeholders. |
| R17, R18 | **Met locally.** TypeScript on Workers and D1 with a structured contract, an allowlisted compiler, bound values and separated domain functions. |
| R23 | **Scope documented; elapsed effort unverified.** The brief's 6–10 hour expectation is retained, but no complete time log establishes that implementation and follow-ups fit it. |
| R19, R20, R21, R22 | **Met.** The README records commands that were actually executed, the architecture and data flow, tool routing with worked examples, and the assumptions, unsupported queries and future work. |
| R24 | **Met.** [AI_USAGE.md](../AI_USAGE.md) records the actual implementation assistance and the defects the checks caught. |
| R25 | **Met for the engineering handoff.** The public repository, deployed URL, production revision, D1 state and credentials status are recorded in [docs/submission-checklist.md](submission-checklist.md). External reviewer/employer submission remains an owner action. |

Optional bonuses: B03 (tests) is included well beyond the minimum. B01, B02, B04 and B05 were not implemented. B06 is partially implemented: safe clarification exists, elaborate conversational follow-ups do not.

The remaining release limitations are the **20-case live model evaluation**, checked-in production screenshot refresh and **external reviewer/employer handoff**. Production deployment, deterministic API/UI behavior and the forecast layout fix are complete; the [screenshot README](screenshots/README.md#review-limits) records the browser-tool file-write limitation. There is no supplied deadline; do not invent one.

## Frontend redesign handoff

The incremental Spaceship logistics-dashboard redesign is implemented within the existing React 19, TypeScript, Vite and ordinary-CSS application. It retains the current Overview and Forecasts controllers, analytical contracts, Recharts views, AI Analyst behavior, themes and hash navigation. It does not add maps, tracking, authentication, a Tailwind migration, or backend/data changes.

The responsive shell, native modal behavior, TanStack Table v8.21.3 result tables, CSV contract and browser evidence are documented in [docs/frontend-redesign.md](frontend-redesign.md). Local verification for this handoff reports 253 tests in 23 files, a passing typecheck and production build, and 13/13 workerd smoke checks. Production deployment is validated; the limited live-model result and remaining external handoff are recorded above.
