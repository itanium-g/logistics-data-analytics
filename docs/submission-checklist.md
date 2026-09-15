# Submission checklist

AI Analyst: native Workers AI Gemma 4 selects exactly one validated function, with thinking disabled. The real-binding evaluation passed 20/20 cases plus 14/14 critical repeats, and production deployment is fully validated; see [AI validation](ai-validation.md) for evidence.

## Handoff fields

| Item | Current value | Release action |
|---|---|---|
| Repository | [itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics), public | Complete any external reviewer handoff separately. |
| Deployed app URL | https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev | Stable public Worker URL verified. |
| Credentials | Not required; no login in this profile | Do not add credentials to the repository. |
| Deployed commit | `72bf067edf63b280a0161ab6b93555fd85d569a8` | Deployed release commit on `main`. |
| Worker revision | `2ceeb3ce-3b8f-4e13-b1c7-76d2e1963a86`; deployment `2d0eb3e4-54d0-478c-8e06-f6f1aeb273e4` | 100% traffic on this version at verification. |
| D1 | `logistics-analytics-demo` / `38482f2d-165a-46d2-91b6-89e222f77de5` | Production migration and seed verified: 400 orders / 355 SKUs. |
| Data source | [Supplied CSV](assignment/README.md#original-files), SHA-256 verified at import | Production reports data version `1.0.0` and metric version `2`. |
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
- [x] Twenty frozen live cases and fourteen critical repeats have recorded passing results against the real Workers AI binding. See [ai-validation.md](ai-validation.md). Production rollout and public API/browser checks are complete.
- [x] No provider keys or credentials are committed or shipped in the browser bundle.
- [x] Quota admission, pacing, timeout, retry bounds, and concurrent reservation behavior are covered by tests.
- [x] The forecast container-query fix is checked at the 1440 × 1100 docked-assistant breakpoint locally and in production.
- [x] The 12 screenshot filenames are retained and the gallery paths are repository-relative.
- [x] Production D1 id, remote migrations, seed row count, Worker URL, revision, and browser validation are recorded below.

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
| `GET /api/health` | **Passed** — HTTP 200 |
| `GET /api/meta` | **Passed** — HTTP 200; data version `1.0.0`, metric version `2`, 355 SKUs |
| Analytics and GLS ranking | **Passed** — carrier delay-rate ranking places GLS first at 2/7 (28.57%) |
| CRAYON-0008 forecast | **Passed** — four-month forecast and 3-unit coverage target |
| SPA deep links and unknown API JSON 404 | **Passed** — direct navigation works; unknown API route returns JSON 404 |
| Chrome responsive/theme/assistant review | **Passed** — production review at 390, 768, 1280, 1440 and 1920px; no horizontal overflow or console errors observed |
| Live AI validation | **Passed** — 34/34 cases against the real Workers AI binding (20 frozen + 14 critical repeats) and separate public-production API/browser verification with zero pacing delay. See [AI validation](ai-validation.md). |

## Final handoff actions

1. The verified feature branch `fix/ai-analyst-workers-ai` (`d5dcbe1`) was merged into `main` with commit `72bf067edf63b280a0161ab6b93555fd85d569a8`.
2. The complete verification suite passed on the merged `main`: typecheck, 287 tests in 24 files, production build, 13/13 smoke checks and `git diff --check`.
3. The existing production D1 was reused, migrations and the checked seed were applied, and the remote count was verified at 400 rows / 355 SKUs.
4. `npm run deploy` was run from `main`; Worker revision `2ceeb3ce-3b8f-4e13-b1c7-76d2e1963a86` (deployment `2d0eb3e4-54d0-478c-8e06-f6f1aeb273e4`) was deployed to `https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev`.
5. Production was validated through the public API (7/7 canonical questions passing consecutively with zero delay) and Chrome DevTools. The checked-in screenshot catalog remains the local capture set because the browser tool rejected repository screenshot paths; this limitation is recorded in [docs/screenshots/README.md](screenshots/README.md).
6. Post-deployment documentation cleanup synchronizes the final deployed revision and evidence across repository files.
