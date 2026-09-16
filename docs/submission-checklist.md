# Submission checklist

Use this page when sharing the project with an employer.

## Handoff details

| Item | Value |
|---|---|
| Repository | [github.com/itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics) |
| Live application | [logistics-analytics-demo.ghiffariahmadijaya.workers.dev](https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev) |
| Credentials | Not required; the demo has no login. |
| Dataset | Supplied synthetic logistics dataset; read-only in the application. |
| Main stack | React, TypeScript, Hono, Cloudflare Workers, D1, Workers AI. |

## Recommended reviewer path

1. Open the live application and inspect Overview.
2. Try the Forecasts view with SKU `CRAYON-0008`.
3. Try the AI Analyst with a supported order question if the provider is available.
4. Review the evidence panel, assumptions, and responsive layout.
5. Read the [README](../README.md) and [architecture notes](architecture/implementation-plan.md).

## Local verification

Run from a clean checkout with the supplied CSV available at `docs/assignment/mock_logistics_data.csv`:

```sh
npm ci
npm run data:import
npm run db:migrate
npm run db:seed
npm run typecheck
npm test
npm run build
npm run smoke
```

The smoke checks use local workerd and do not contact Workers AI. GitHub Actions runs the typecheck, tests, build, and deterministic smoke checks automatically.

## Evidence and limitations

- The five KPI values and forecast calculations are deterministic and covered by automated tests.
- The AI route validates one operation before running the same deterministic query or forecast code.
- The repository includes frozen AI cases and a live-evaluation runner. Provider availability, quota, and model behavior can change; no permanent production AI pass-rate claim is made.
- The dataset has no promised delivery dates, contractual SLA, stock-on-hand, inbound supply, lead time, or backorder fields.
- The public demo is intentionally unauthenticated because it contains only synthetic data.

## Before sending

- [ ] Open the live URL in a fresh browser.
- [ ] Confirm the repository and URL are accessible to the recipient.
- [ ] Run the local verification commands after the final code change.
- [ ] Share only the repository URL, live URL, and “credentials not required”.
