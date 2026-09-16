# Assignment coverage

This page gives an employer-friendly summary of how the implementation addresses the Spaceship Code Test. The supplied brief remains the authority; the source catalog is in [assignment/README.md](assignment/README.md).

## Required scope

| Area | Implementation | Evidence |
|---|---|---|
| Dashboard | Overview with five KPI cards, filters, charts, tables, and CSV export | `src/client/features/overview/`, `src/client/features/evidence/` |
| KPIs | Total, delivered, delayed, on-time status proxy, and average delivery time | `src/domain/metrics.ts`; metric tests |
| Charts | Monthly volume, status breakdown, and dynamic charts for query results | `src/domain/chart.ts`; query/UI tests |
| Natural language | One validated operation: metric query, forecast, clarification, or unsupported response | `src/server/routes/ask.ts`; `src/domain/decision.ts` |
| Forecast | Known-SKU, one-to-four-month demand forecast with history, future values, method, and coverage target | `src/domain/forecast.ts`; forecast tests |
| Evidence | Scope, date basis, metric definitions, assumptions, and supporting rows accompany results | `src/client/features/evidence/` |
| Data safety | Supplied data is validated on import; analytical request paths do not modify order data | `src/data/`, request-validation tests |
| Deployment | Public Cloudflare Worker with D1 and Workers AI bindings | [live demo](https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev); [deployment notes](deployment/cloudflare.md) |
| Documentation | Setup, architecture, assumptions, limitations, and AI assistance disclosure | [README](../README.md), [AI_USAGE.md](../AI_USAGE.md) |

## Design interpretation

The brief does not define KPI formulas or an SLA field. This implementation therefore labels `delivered / (delivered + delayed)` as an **on-time status proxy** and excludes unknown outcomes from the denominator. Exact SLA compliance is reported as unavailable rather than guessed.

The forecast supports the assignment's known-SKU example. It uses non-canceled historical quantity and a transparent sparse-history average. Its coverage number is a planning target, not a net purchase quantity or a statistical confidence estimate.

## Optional scope

The implementation includes targeted tests, safe clarification, and bounded request flows. It does not include query history, category-level forecasts, uploads, authentication, Docker, multi-agent workflows, or a second LLM provider. These are not required for the core submission.

## Where to start

1. Open the [live demo](https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev).
2. Read the [README](../README.md) for setup and the system overview.
3. Review [architecture notes](architecture/implementation-plan.md) for the main design decisions.
4. Run the checks listed in the [submission checklist](submission-checklist.md).
