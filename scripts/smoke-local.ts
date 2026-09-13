/**
 * Local acceptance smoke harness.
 *
 * Builds are assumed to be current. This starts the Cloudflare preview server
 * (workerd plus the static asset layer, the same routing model as deployment),
 * probes the routing boundary and API surface, then shuts the server down.
 *
 * Run with: npm run smoke
 * It never contacts a model provider and never performs a remote deployment.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = 90_000;

interface Check {
  readonly name: string;
  readonly run: () => Promise<void>;
}

class CheckError extends Error {}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new CheckError(message);
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = "no attempt made";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown";
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new CheckError(`Preview server never became ready: ${lastError}`);
}

const checks: Check[] = [
  {
    name: "GET /api/health returns JSON 200",
    run: async () => {
      const response = await fetch(`${BASE}/api/health`);
      assert(response.status === 200, `expected 200, got ${response.status}`);
      assert(
        (response.headers.get("content-type") ?? "").includes("application/json"),
        "expected a JSON content type",
      );
      const body = (await response.json()) as { status?: string };
      assert(body.status === "ok", `expected status ok, got ${String(body.status)}`);
    },
  },
  {
    name: "GET /api/unknown returns JSON 404, not SPA HTML",
    run: async () => {
      const response = await fetch(`${BASE}/api/unknown-route`);
      assert(response.status === 404, `expected 404, got ${response.status}`);
      const text = await response.text();
      assert(!text.includes("<div id=\"root\">"), "API 404 leaked the SPA shell");
      const body = JSON.parse(text) as { error?: { code?: string } };
      assert(body.error?.code === "not_found", `expected not_found, got ${String(body.error?.code)}`);
    },
  },
  {
    name: "API browser navigation still returns JSON 404",
    run: async () => {
      const response = await fetch(`${BASE}/api/unknown-route`, {
        headers: { Accept: "text/html,application/xhtml+xml", "Sec-Fetch-Mode": "navigate" },
      });
      assert(response.status === 404, `expected 404, got ${response.status}`);
      assert(
        (response.headers.get("content-type") ?? "").includes("application/json"),
        "expected a JSON content type for an API navigation",
      );
    },
  },
  {
    name: "GET /api/meta returns metric contract and coverage from local D1",
    run: async () => {
      const response = await fetch(`${BASE}/api/meta`);
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as {
        metric_version?: string;
        observed?: { row_count?: number };
        metrics?: { id: string; label: string }[];
        vocabulary?: { carriers?: string[] };
      };
      assert(body.metric_version === "2", `expected metric version 2, got ${String(body.metric_version)}`);
      assert(
        body.observed?.row_count === 400,
        `expected 400 imported rows, got ${String(body.observed?.row_count)}`,
      );
      const onTime = body.metrics?.find((metric) => metric.id === "on_time_rate");
      assert(
        onTime?.label === "On-time delivery rate (status proxy)",
        `expected the status-proxy label, got ${String(onTime?.label)}`,
      );
      assert(
        (body.vocabulary?.carriers ?? []).includes("GLS"),
        "expected carrier vocabulary to include GLS",
      );
    },
  },
  {
    name: "POST /api/query ranks carrier delay rate with GLS first",
    run: async () => {
      const response = await postJson("/api/query", {
        metrics: ["delay_rate", "total_orders"],
        breakdown: "carrier",
        order_by: "delay_rate",
        order_dir: "desc",
        relative_range: "all_time",
      });
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as {
        rows?: { key: string; metrics: { metric: string; numerator?: number; denominator?: number }[] }[];
        total_groups?: number;
        chart?: { hint?: string };
      };
      const top = body.rows?.[0];
      assert(top?.key === "GLS", `expected GLS first, got ${String(top?.key)}`);
      const rate = top?.metrics.find((metric) => metric.metric === "delay_rate");
      assert(
        rate?.numerator === 2 && rate?.denominator === 7,
        `expected GLS 2/7, got ${String(rate?.numerator)}/${String(rate?.denominator)}`,
      );
      assert(body.total_groups === 9, `expected 9 carrier groups, got ${String(body.total_groups)}`);
      assert(body.chart?.hint === "bar", `expected a bar chart, got ${String(body.chart?.hint)}`);
    },
  },
  {
    name: "POST /api/query returns twelve monthly buckets summing to 400",
    run: async () => {
      const response = await postJson("/api/query", {
        metrics: ["total_orders"],
        time_grain: "month",
        relative_range: "last_12_months",
        limit: 100,
      });
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as {
        rows?: { key: string; metrics: { value: number | null }[] }[];
        scope?: { from?: string; to?: string };
        chart?: { hint?: string };
      };
      assert(body.rows?.length === 12, `expected 12 months, got ${String(body.rows?.length)}`);
      assert(body.scope?.from === "2025-01-01", `expected 2025-01-01, got ${String(body.scope?.from)}`);
      const total = (body.rows ?? []).reduce(
        (sum, row) => sum + (row.metrics[0]?.value ?? 0),
        0,
      );
      assert(total === 400, `expected 400 orders across months, got ${total}`);
      assert(body.chart?.hint === "line", `expected a line chart, got ${String(body.chart?.hint)}`);
    },
  },
  {
    name: "POST /api/query rejects an injected filter value and leaves data intact",
    run: async () => {
      const response = await postJson("/api/query", {
        metrics: ["total_orders"],
        filters: [{ field: "carrier", op: "eq", values: ["DHL'; DROP TABLE orders; --"] }],
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      const body = (await response.json()) as { error?: { code?: string } };
      assert(
        body.error?.code === "unknown_value",
        `expected unknown_value, got ${String(body.error?.code)}`,
      );

      const check = await postJson("/api/query", {
        metrics: ["total_orders"],
        relative_range: "all_time",
      });
      const checkBody = (await check.json()) as { rows?: { metrics: { value: number }[] }[] };
      assert(
        checkBody.rows?.[0]?.metrics[0]?.value === 400,
        "orders table was altered by the rejected request",
      );
    },
  },
  {
    name: "POST /api/forecast reproduces the CRAYON-0008 target of 3 units",
    run: async () => {
      const response = await postJson("/api/forecast", { sku: "CRAYON-0008" });
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as {
        forecast?: { month: string; units: number }[];
        coverage_target_units?: number;
        method?: { id?: string };
        as_of_date?: string;
        coverage_status?: string;
      };
      assert(
        body.forecast?.length === 4,
        `expected 4 forecast months, got ${String(body.forecast?.length)}`,
      );
      assert(
        body.forecast?.[0]?.month === "2026-01" && body.forecast?.[3]?.month === "2026-04",
        "expected January to April 2026",
      );
      assert(
        body.coverage_target_units === 3,
        `expected a target of 3 units, got ${String(body.coverage_target_units)}`,
      );
      assert(
        body.method?.id === "sparse_12_month_mean",
        `expected the sparse method, got ${String(body.method?.id)}`,
      );
      assert(body.as_of_date === "2025-12-31", `expected as-of 2025-12-31, got ${String(body.as_of_date)}`);
      assert(
        body.coverage_status === "coverage_unverified",
        `expected coverage_unverified, got ${String(body.coverage_status)}`,
      );
    },
  },
  {
    name: "POST /api/forecast rejects an unknown SKU",
    run: async () => {
      const response = await postJson("/api/forecast", { sku: "CRAYON-9999" });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      const body = (await response.json()) as { error?: { code?: string } };
      assert(
        body.error?.code === "unknown_value",
        `expected unknown_value, got ${String(body.error?.code)}`,
      );
    },
  },
  {
    name: "POST /api/ask is disabled without a provider and says so clearly",
    run: async () => {
      const response = await postJson("/api/ask", { question: "How many orders are there?" });
      assert(response.status === 503, `expected 503, got ${response.status}`);
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      assert(
        body.error?.code === "provider_disabled",
        `expected provider_disabled, got ${String(body.error?.code)}`,
      );
      assert(
        (body.error?.message ?? "").includes("dashboard"),
        "expected the message to point at the deterministic features",
      );
    },
  },
  {
    name: "POST /api/ask rejects an oversized question before any provider call",
    run: async () => {
      const response = await postJson("/api/ask", { question: "a".repeat(1001) });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      const body = (await response.json()) as { error?: { code?: string } };
      assert(body.error?.code === "bad_input", `expected bad_input, got ${String(body.error?.code)}`);
    },
  },
  {
    name: "GET / serves the SPA shell",
    run: async () => {
      const response = await fetch(`${BASE}/`);
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const text = await response.text();
      assert(text.includes("<div id=\"root\">"), "SPA root container missing");
    },
  },
  {
    name: "SPA deep link falls back to the shell",
    run: async () => {
      const response = await fetch(`${BASE}/forecast`, {
        headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
      });
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const text = await response.text();
      assert(text.includes("<div id=\"root\">"), "SPA fallback did not serve the shell");
    },
  },
];

function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

async function main(): Promise<void> {
  // Invoke Vite's CLI directly with the current Node executable. Using a shell
  // here would concatenate arguments unescaped. The CLI is not an exported
  // subpath, so it is resolved from node_modules by path.
  const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteCli)) {
    console.log(`  FAIL  vite CLI not found at ${viteCli}; run npm ci first`);
    process.exit(1);
  }
  const server = spawn(
    process.execPath,
    [viteCli, "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );

  let serverLog = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });

  let failures = 0;
  try {
    await waitForServer();
    for (const check of checks) {
      try {
        await check.run();
        console.log(`  PASS  ${check.name}`);
      } catch (error) {
        failures += 1;
        console.log(`  FAIL  ${check.name}`);
        console.log(`        ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  preview server startup`);
    console.log(`        ${error instanceof Error ? error.message : String(error)}`);
    console.log(serverLog.trim());
  } finally {
    if (server.pid !== undefined) killTree(server.pid);
  }

  console.log(
    `\n${checks.length - failures}/${checks.length} smoke checks passed against ${BASE}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
