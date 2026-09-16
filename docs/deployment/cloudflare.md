# Cloudflare deployment

The application is deployed as one Cloudflare Worker with Workers Static Assets, D1, and the native Workers AI binding.

## Public demo

[logistics-analytics-demo.ghiffariahmadijaya.workers.dev](https://logistics-analytics-demo.ghiffariahmadijaya.workers.dev)

The demo uses the supplied synthetic dataset and does not require authentication. The deterministic dashboard, query, and forecast paths do not depend on an AI provider. The AI Analyst is subject to Workers AI availability and quota.

## Production configuration

Production settings are under `env.production` in `wrangler.jsonc`:

- Worker: `logistics-analytics-demo`
- D1 binding: `DB`
- Workers AI binding: `AI`
- Default model: `@cf/google/gemma-4-26b-a4b-it`
- Paid escalation: disabled unless explicitly enabled
- AI request and token limits: enabled

No external provider key is required. Never put a provider key, Cloudflare token, or login credential in Git or frontend code.

## Deploy from a clean checkout

Requirements: Node.js 24+, npm, an authenticated Cloudflare account, and the supplied CSV.

```sh
npm ci
npm run data:import
npm run db:migrate:remote
npm run db:seed:remote
npm run typecheck
npm test
npm run build
npm run smoke
npm run deploy
```

`npm run deploy` selects the `production` Wrangler environment, builds the SPA, and deploys the Worker. Run it from the intended release branch after reviewing the diff.

Before the first deployment, authenticate with `npx wrangler login` and confirm that the production D1 binding points to the intended database. The seed command writes the generated dataset; it does not contain the AI usage table.

## Quick checks

Replace `<url>` with the deployed URL:

```sh
curl <url>/api/health
curl <url>/api/meta
curl -X POST <url>/api/query \
  -H "content-type: application/json" \
  --data '{"metrics":["total_orders"],"relative_range":"all_time"}'
curl -X POST <url>/api/forecast \
  -H "content-type: application/json" \
  --data '{"sku":"CRAYON-0008"}'
```

Expected fixture checks include 400 orders, 355 SKUs, a valid metric contract, and a four-month CRAYON-0008 forecast. Review the browser at both desktop and mobile widths before sharing the URL.

## Disable AI safely

Set `AI_ENABLED` to `false` in the production environment and redeploy. The dashboard, query API, and forecast remain available. Keep `AI_ALLOW_PAID_ESCALATION` set to `false` unless paid usage has been explicitly approved.
