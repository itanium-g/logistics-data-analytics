# Spaceship Logistics Analytics

Planning and source materials for the Spaceship Senior Engineer Code Test. Updated September 11, 2026.

**Status: documentation only. The application has not been implemented or deployed.** The supplied assignment and all four attachments have now been reviewed. The plan targets the brief's 6–10 hour effort and preserves its required features.

## Start here

| Document | Purpose |
|---|---|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Small build scope, decisions, contracts, time budget and acceptance gates. |
| [Requirements matrix](docs/requirements.md) | Source-by-source requirements, optional bonuses, rubric and example expectations. |
| [Assignment materials](docs/assignment/README.md) | Supplied DOCX/PDF/CSV filenames, checksums and external links; originals are not committed. |
| [Data audit](docs/data-audit.md) | Verified 400-row facts, KPI assumptions, date basis and sparse SKU history. |
| [SETUP_AND_COMPARISON.md](SETUP_AND_COMPARISON.md) | Future setup runbook and retained hosting/LLM comparison matrices. |
| [deep-research-report.md](deep-research-report.md) | Earlier reference audit and updated architecture analysis. |
| [Submission checklist](docs/submission-checklist.md) | Repository access, deployed URL, credentials and release evidence. |
| [AI_USAGE.md](AI_USAGE.md) | Actual research/planning assistance and verification performed. |

## Assignment and reference links

- [Original Notion brief](https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24)
- [Reference answer repository](https://github.com/KhresnaPanduI/spaceship-logistics-analytics)
- [Audited reference revision](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3)

The supplied coding brief and specification now establish requirements directly. The reference is comparison material; its code is not copied. The source catalog records assignment provenance and are not covered by an invented open-source license.

## Planned product and architecture

Build one React dashboard and Hono API on Cloudflare Workers Static Assets, with D1 for the read-only dataset and separate usage counters. Evaluate Groq openai/gpt-oss-20b Free as the first live router. The target is $0 within quotas; actual account eligibility, runtime fit and model quality remain untested.

The model converts a question into one validated Query or Forecast decision. Application code performs all arithmetic, selects a chart from the result shape, and renders the answer and evidence. Dashboard and direct forecast forms work without a model. No login is planned for the supplied synthetic demo.

Required behavior: five KPI cards, at least two charts, dynamic natural-language analytics, known-SKU forecasts for up to four months, a historical/future visualization, numerical inventory planning target, methodology, filters and underlying data.

## Local setup and environment variables

There is no package.json, application scaffold, migration or executable setup script yet. The commands in the [setup guide](SETUP_AND_COMPARISON.md) are proposed future steps, not a runnable application at this revision. Replace this section with clean-checkout instructions verified against the implemented app before submission.

| Planned setting | Purpose |
|---|---|
| DB binding | Local/deployed D1 database for imported analytics and separate quota state. |
| GROQ_API_KEY | Server-side provider secret; never commit or expose in browser code. |
| LLM_ENABLED | False for ordinary local tests; enabled for the verified live demo. |
| LLM_PROVIDER / LLM_MODEL / LLM_BILLING_MODE | groq / openai/gpt-oss-20b / free for the initial profile. |
| Token, request and pacing limits | Bounds documented in the plan and setup guide. |

The future importer takes the user-supplied CSV from an explicit local path and verifies it against the [source catalog](docs/assignment/README.md#original-files). Required build tools and exact compatible dependency versions must be pinned and verified during implementation.

## Assumptions and limitations

- The CSV contains 400 orders, 355 SKUs and historical 2025 dates. Sparse SKU forecasts are illustrative baselines.
- No promised-delivery date exists. On-time and delay rates use explicit status proxies; exceptions are separate. See metric version 2 in the data audit.
- Dataset mode visibly anchors relative questions to January 1, 2026. Delivery-event questions use delivery_date; order cohorts use order_date. Current mode can return empty ranges.
- Complete 2025 coverage is a synthetic-demo assumption. Forecasts show that uncertainty and their historical as-of date.
- Inventory output is a buffered demand coverage target. Stock, inbound supply and lead time are missing, so net purchases and service-level guarantees are unsupported.
- Arbitrary SQL, causal explanations, uploads, multi-step agent actions and exact SLA calculations are outside the supported subset.
- No application tests, live routing results or deployment performance are claimed.

## Future improvements

After the required submission works, consider category forecasts, query history, richer validation cases, time-ordered forecast evaluation, model comparison and optional access controls. Production identity, calibrated inventory policies, larger datasets and operational hardening require separate scope.

## Submission status

| Deliverable | Current state |
|---|---|
| Repository | [itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics); currently private, reviewer access pending. |
| Deployed app URL | Not deployed. |
| Credentials | No login planned; record “Not required” when the deployed profile is verified. |

No deadline is supplied. Complete the [submission checklist](docs/submission-checklist.md) after implementation. Planning completion does not mean the coding assignment is ready to submit.
