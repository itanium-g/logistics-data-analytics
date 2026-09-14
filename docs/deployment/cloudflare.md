# Cloudflare Native Deployment Guide

This guide details the single-worker production deployment of Spaceship Logistics Analytics to the Cloudflare developer platform.

## Architecture

The entire solution runs as a single unified Cloudflare Worker with zero external infrastructure dependencies:
- **Client SPA:** Built with Vite + React 19 + TanStack Table + Recharts. Static assets (`dist/client/`) are served directly by Workers Static Assets.
- **Backend API:** Built with Hono routing running on the Cloudflare Workers runtime.
- **Relational Data:** Cloudflare D1 (serverless SQLite at the edge) storing order records and import manifest.
- **Natural Language Assistant:** Multi-tier Cloudflare Workers AI with AI Gateway routing:
  - Default: `@cf/google/gemma-4-26b-a4b-it` (normal analytics, summaries, tool calls)
  - Escalation: `@cf/zai-org/glm-5.3-flash` (complex reasoning, long context)
  - Fallback: `@cf/zai-org/glm-4.7-flash` (if GLM-5.3 Flash billing is disabled)
  - Observability & Caching: Cloudflare AI Gateway (`AI_GATEWAY_ID`)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Edge                               │
│                                                                        │
│   Browser ──► Cloudflare Worker (src/server/index.ts)                  │
│               ├── Static Assets (dist/client/*)                        │
│               ├── API Routes (/api/query, /api/forecast, /api/ask)     │
│               ├── Quota & Guard Middleware                             │
│               ├── D1 Binding (DB) ──► Serverless SQLite                │
│               └── Workers AI (AI) + AI Gateway                         │
│                   ├── Default: @cf/google/gemma-4-26b-a4b-it           │
│                   ├── Escalation: @cf/zai-org/glm-5.3-flash            │
│                   └── Fallback: @cf/zai-org/glm-4.7-flash              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. Cloudflare account ([dash.cloudflare.com](https://dash.cloudflare.com))
2. Node.js 22+ or 24+ installed locally
3. Repository checked out with dependencies installed (`npm ci`)

---

## Step-by-Step Deployment

### 1. Authenticate with Cloudflare
```bash
npx wrangler login
```

### 2. Provision the D1 Database
Create the production D1 database:
```bash
npx wrangler d1 create spaceship-db
```
The command outputs your unique `database_id`. Open `wrangler.jsonc` and replace the placeholder `00000000-0000-0000-0000-000000000000` with your real database ID:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "spaceship-db",
    "database_id": "<YOUR_D1_DATABASE_ID>",
    "migrations_dir": "migrations"
  }
]
```

### 3. Run Migrations on Remote D1
Apply the initial schema (`orders`, `data_manifest`, `llm_usage`):
```bash
npm run db:migrate:remote
```

### 4. Import & Seed Remote Data
Run the offline importer on the dataset (verifies SHA-256 and generates `.generated/seed.sql`):
```bash
npm run data:import
```
Then execute the generated seed file against remote D1:
```bash
npm run db:seed:remote
```

### 5. Build and Deploy
Build client assets and deploy the Worker:
```bash
npm run build
npm run deploy
```
Wrangler will output the live URL: `https://logistics-analytics-demo.<your-subdomain>.workers.dev`.

### 6. Verify Production Deployment
Visit your live deployment URL in a modern web browser:
- **Overview workspace:** Verify KPI cards and charts render instantly from D1.
- **Forecast workspace:** Run SKU coverage forecasts.
- **AI Analyst:** Open the copilot drawer and submit a question (e.g. *"Which carrier has the highest delay rate?"*).

You can also run the frozen evaluation suite against your live URL:
```bash
npm run eval:ai:live -- --endpoint https://logistics-analytics-demo.<your-subdomain>.workers.dev/api/ask
```

---

## Quotas and Pricing

| Component | Free Tier Allowance | Application Budget |
|:----------|:--------------------|:-------------------|
| Cloudflare Workers | 100,000 requests / day | ~500 daily user questions |
| Cloudflare D1 | 5,000,000 row reads / day | Query requests scoped and bounded |
| Workers AI | Daily Neurons allocation | Strictly bounded input tokens (4,096) and max output tokens (512) |
| External APIs | None | $0.00 / month |
