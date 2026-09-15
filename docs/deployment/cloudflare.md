# Cloudflare deployment guide

This application is a single Cloudflare Worker with Workers Static Assets, D1, and the native Workers AI binding. The analytics and forecast paths are deterministic and do not require an AI provider. The deployment commands below are intended to run from the verified `main` branch.

## Production architecture

- `src/server/index.ts` serves the Hono API.
- Vite builds the React SPA into the Worker asset bundle.
- D1 binding `DB` stores `orders`, the data manifest, and quota usage.
- Workers AI binding `AI` is enabled in Wrangler's `production` environment.
- Gemma 4 (`@cf/google/gemma-4-26b-a4b-it`) is the default model and is listed by Cloudflare as available on the Workers Free plan.
- GLM-4.7 Flash (`@cf/zai-org/glm-4.7-flash`) is the free-compatible fallback.
- GLM-5.3 Flash (`@cf/zai-org/glm-5.3-flash`) is retained only as an explicit opt-in paid escalation; `AI_ALLOW_PAID_ESCALATION` is false by default.
- AI Gateway is optional and unset by default. Do not add a Gateway id unless an existing Gateway's billing, caching, and retention settings have been reviewed.

Cloudflare's current Workers AI guidance identifies Gemma 4 and GLM-4.7 Flash as available on the Workers Free plan, while GLM-5.3 Flash requires Workers Paid or prepaid AI Gateway credits. The default configuration therefore never selects GLM-5.3 because of prompt length, question complexity, malformed output, or a retry.

## Prerequisites

1. Node.js 24 or newer and npm.
2. An authenticated Cloudflare account with Workers and D1 access.
3. The supplied `docs/assignment/mock_logistics_data.csv`.
4. A clean checkout of the verified `main` branch.

Authenticate without committing the resulting credentials:

```sh
npx wrangler login
```

## Provision and seed D1

Inspect existing resources before creating anything. Reuse the project database if one already exists. If no suitable database exists, create the one named by `wrangler.jsonc`:

```sh
npx wrangler d1 create logistics-analytics-demo
```

Copy the returned database id into the `production` D1 binding in `wrangler.jsonc`. Never commit an API token or login credential; the database id is configuration, not a secret.

Generate the checked dataset's deterministic seed, apply the schema, and seed the remote database:

```sh
npm ci
npm run data:import
npm run db:migrate:remote
npm run db:seed:remote
npx wrangler d1 execute logistics-analytics-demo --remote --command "SELECT COUNT(*) AS row_count FROM orders"
```

The final query must report 400 rows. Also verify `/api/meta` after deployment reports data version `1.0.0`, metric version `2`, and the expected 355-SKU vocabulary.

## Deploy the verified main branch

Build and deploy with the package script. It selects the Vite plugin's `production` environment during the build and deploys that flattened configuration, which enables Workers AI while keeping paid escalation off:

```sh
npm run typecheck
npm test
npm run build
npm run smoke
npm run deploy
```

Record the Worker name, public URL, deployment version, final `main` SHA, D1 name/id, and AI configuration in the submission checklist. The deploy command must be run from `main`, never from the feature branch.

## Production checks

Replace `<url>` with the URL printed by Wrangler:

```sh
curl <url>/api/health
curl <url>/api/meta
curl -X POST <url>/api/query \
  -H "content-type: application/json" \
  --data '{"metrics":["delay_rate","total_orders"],"breakdown":"carrier","order_by":"delay_rate","order_dir":"desc","relative_range":"all_time"}'
curl -X POST <url>/api/forecast \
  -H "content-type: application/json" \
  --data '{"sku":"CRAYON-0008"}'
```

The carrier query should place GLS first at 2/7 (28.57%), and the CRAYON-0008 forecast should return January–April 2026 with a coverage target of 3 units. Validate the SPA root, `/forecast` reload, an unknown `/api` route, mobile and desktop layouts, both themes, filters, assistant states, browser console, and network requests in Chrome DevTools.

If free-tier Workers AI access is available, enablement is already on in production and the live `/api/ask` route may be tested. Record the exact result and model used. A deterministic analytics deployment remains acceptable if the account returns a plan/access error; do not enable paid billing just to make the live model check pass.

## Rollback and cost controls

- Disable the natural-language path by setting `AI_ENABLED="false"` in the production environment and redeploying. Query and forecast remain available.
- Keep `AI_ALLOW_PAID_ESCALATION="false"` unless paid usage has been deliberately approved.
- Keep the input/output bounds, D1 quota admission, pacing, and bounded retries in place.
- Never add an external provider key, external database, or Gateway solely to bypass a Workers AI access limitation.
