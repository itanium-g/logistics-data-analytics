# Spaceship Logistics Analytics

Cost-first research, architecture, setup and implementation planning for the Spaceship Senior Engineer Code Test. Updated September 11, 2026.

## Source materials

| Source | Link | Purpose |
|---|---|---|
| Original assignment brief and attachments | [Spaceship Senior Engineer Code Test](<https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24>) | Primary source for the brief, linked files, exact requirements, evaluation criteria, and submission instructions. |
| Answer/reference repository | [KhresnaPanduI/spaceship-logistics-analytics](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics>) | Reference implementation used for the independent audit and design comparison. |
| Audited reference snapshot | [Commit 1c1ee718](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3>) | Reproducible reference revision used by the report. |
| Reference AI disclosure | [AI_USAGE.md](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/AI_USAGE.md>) | Reference repository's AI-use disclosure and reported bonus topics. |
| Reference data fixture | [mock_logistics_data.csv](<https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/backend/data/mock_logistics_data.csv>) | Fixture used for the report's independently checked data facts. |

The Notion page remains the authority for the assignment wording and attachments. This repository stores links to those external materials rather than copying the Notion page, its attachments, or reference-repository code/data.

## Repository contents

- [SETUP_AND_COMPARISON.md](SETUP_AND_COMPARISON.md) — start here: complete proposed setup, current stack, hosting/database/VPS matrices, free and paid LLM comparisons, cost formulas, provider selection and deployment runbook.
- [deep-research-report.md](deep-research-report.md) — audit findings, evidence, architecture decision, analytical meaning and limitations.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — requirements gate, contracts, phased backlog, estimates, test plan, and release gates.

This is currently a documentation-only design repository. The application has not been implemented or benchmarked here; setup commands are proposed until the application files and scripts exist.

Recommended starting point: React 19.3 + Hono on Cloudflare Workers Static Assets + D1, with Groq GPT-OSS 20B Free as the first router candidate and DeepInfra Gemma 4 E4B as the low-price challenger. Target $0 within quotas; Workers Paid adds a $5/month base if measured runtime limits require it. No model has passed a live project evaluation yet. See the setup guide for dated sources, cash-versus-usage costs and constraints.

## Reconstructed scope

Based on the available reference material, the proposed system covers:

- validated logistics-data ingestion and provenance;
- deterministic KPI, breakdown, and trend analytics;
- a reviewer-friendly dashboard with evidence and limitations;
- bounded natural-language question routing into validated analytics;
- transparent category-level demand forecasting;
- low-cost hosting and model usage with durable budget controls;
- security, accessibility, automated tests, and honest AI disclosure.

These items remain provisional until the original Notion brief and attachments are checked against Gate G00 in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
