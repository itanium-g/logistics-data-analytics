# Submission checklist

Status: **The application is implemented and the release is being verified from `main`.** This checklist distinguishes deterministic local evidence from live Cloudflare evidence. No authentication credentials are required for the synthetic-data demo.

## Handoff fields

| Item | Current value | Release action |
|---|---|---|
| Repository | [itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics) | Verify reviewer access using the intended handoff method. |
| Deployed app URL | Pending final `main` deployment | Record the stable HTTPS URL after production validation. |
| Credentials | Not required; no login in this profile | Do not add credentials to the repository. |
| Deployed commit | Pending | Record the exact `main` SHA served by the Worker. |
| Data source | [Supplied CSV](../assignment/README.md#original-files), SHA-256 verified at import | Confirm production D1 contains data version `1.0.0`, metric version `2`, and 400 orders. |
| Deadline | Not specified | Record only if later supplied. |

## Required product checks

- [x] Five KPI cards show computed values with honest definitions: 400 / 304 / 55 / 84.68% / 3.69 days.
- [x] At least two dashboard charts render from the same deterministic query results as their evidence tables.
- [x] The carrier delay-rate example places GLS first at 2/7 (28.57%).
- [x] The CRAYON-0008 forecast returns January–April 2026 and a 3-unit coverage target.
- [x] Every analytical answer exposes its scope, assumptions, metrics, and supporting rows.
- [x] Exceptions, missing SLA dates, sparse SKU history, and unverified coverage are disclosed.
- [x] Invalid, unsupported, empty, throttled, timeout, and provider-error states return clear typed errors.

## Engineering and deployment checks

- [x] Node 24 is the declared local and CI toolchain; CI runs `npm ci`, typecheck, tests, build, and deterministic smoke checks.
- [x] Model outputs are bounded and validated; the model cannot execute SQL or provide analytical numbers.
- [x] Supplied analytical data is read-only through request paths; only quota usage is written.
- [ ] Twenty frozen live evaluation cases have recorded results. The cases are in [evals/cases.json](../../evals/cases.json); a provider run is required before claiming routing quality.
- [x] No provider keys or credentials are committed or shipped in the browser bundle.
- [x] Quota admission, pacing, timeout, retry bounds, and concurrent reservation behavior are covered by tests.
- [x] The forecast container-query fix is checked at the 1440 × 1100 docked-assistant breakpoint.
- [x] The 12 screenshot filenames are retained and the gallery paths are repository-relative.
- [ ] Production D1 id, remote migrations, seed row count, Worker URL, revision, and browser validation are recorded below after deployment.

## Workers AI policy

- Default: `@cf/google/gemma-4-26b-a4b-it`, listed by Cloudflare as Workers Free-compatible.
- Free fallback: `@cf/zai-org/glm-4.7-flash`.
- Paid model: `@cf/zai-org/glm-5.3-flash`, reachable only when `AI_ALLOW_PAID_ESCALATION="true"` is explicitly configured.
- Production default: `AI_ENABLED="true"`, `AI_ALLOW_PAID_ESCALATION="false"`, no AI Gateway id.
- If free-tier access is unavailable, leave deterministic analytics enabled and record the exact provider limitation; do not enable paid billing to manufacture a passing result.

## Local evidence

Run from `refactor/cloudflare-native` before merge and again from `main` after merge:

```sh
npm ci
npm run data:import
npm run db:migrate
npm run db:seed
npm run typecheck
npm test
npm run build
npm run smoke
git diff --check
```

The test report must record exact counts from the current run. The smoke harness is deterministic and does not contact Workers AI.

## Production evidence

| Check | Result |
|---|---|
| `GET /api/health` | Pending deployment |
| `GET /api/meta` | Pending deployment |
| Analytics and GLS ranking | Pending deployment |
| CRAYON-0008 forecast | Pending deployment |
| SPA deep links and unknown API JSON 404 | Pending deployment |
| Chrome responsive/theme/assistant review | Pending deployment |
| Live Workers AI | Pending free-tier access check; never infer from mocks |

## Final handoff actions

1. Push the verified feature branch, fetch the newest `origin/main`, merge without rewriting history, and push `main`.
2. Rerun the complete verification suite on `main`.
3. Create or reuse only the required D1 database, apply remote migrations, seed the checked CSV, and verify 400 rows.
4. Deploy with `npm run deploy` from `main` and record the Worker URL and revision.
5. Validate production in the API and Chrome DevTools, then update this checklist, `README.md`, `AI_USAGE.md`, the deployment guide, screenshot catalog, and `public/llms.txt` with actual evidence.
6. Commit and push the final documentation on `main`; redeploy if a runtime-served file changed.
