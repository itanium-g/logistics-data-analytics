/**
 * Opt-in live evaluation runner for Cloudflare Workers AI router.
 *
 * Runs through the 20 frozen evaluation cases in evals/cases.json
 * against an active development server with Workers AI enabled.
 *
 * Usage:
 *   npx wrangler dev --remote
 *   npm run eval:ai:live
 *   npm run eval:ai:live -- --endpoint http://localhost:8787/api/ask
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

interface EvalCase {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly expected_tool?: string;
  readonly expected_plan?: Record<string, unknown>;
  readonly expected_facts?: Record<string, unknown>;
}

interface EvalFile {
  readonly version: string;
  readonly frozen_at: string;
  readonly cases: readonly EvalCase[];
}

interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly expectedTool: string;
  readonly actualTool: string;
  readonly passed: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

function parseArgs(): { endpoint: string } {
  const args = process.argv.slice(2);
  let endpoint = "http://localhost:8787/api/ask";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--endpoint" && args[i + 1]) {
      endpoint = args[i + 1]!;
      i++;
    }
  }
  return { endpoint };
}

async function runEval(): Promise<void> {
  const { endpoint } = parseArgs();
  console.log("=== Spaceship Logistics: Live Workers AI Evaluation ===");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model:    @cf/google/gemma-4-26b-a4b-it (default) / @cf/zai-org/glm-5.3-flash (escalation)`);
  console.log("");

  const evalPath = path.resolve("evals", "cases.json");
  const content = readFileSync(evalPath, "utf8");
  const data: EvalFile = JSON.parse(content);

  const results: CaseResult[] = [];
  let passedCount = 0;

  for (const c of data.cases) {
    const expected = c.expected_tool ?? "unsupported";
    const start = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: c.question }),
      });

      const elapsed = Math.round(performance.now() - start);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as any;
        const code = errorBody?.error?.code ?? response.status;
        const msg = errorBody?.error?.message ?? response.statusText;
        const isUnsupportedExpected = expected === "unsupported" && (response.status === 422 || response.status === 400);

        results.push({
          id: c.id,
          category: c.category,
          question: c.question,
          expectedTool: expected,
          actualTool: isUnsupportedExpected ? "unsupported" : `HTTP ${code}`,
          passed: isUnsupportedExpected,
          latencyMs: elapsed,
          error: isUnsupportedExpected ? undefined : msg,
        });
        if (isUnsupportedExpected) passedCount++;
        continue;
      }

      const body = (await response.json()) as { tool: string };
      const actual = body.tool ?? "unknown";
      const passed = actual === expected;
      if (passed) passedCount++;

      results.push({
        id: c.id,
        category: c.category,
        question: c.question,
        expectedTool: expected,
        actualTool: actual,
        passed,
        latencyMs: elapsed,
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      results.push({
        id: c.id,
        category: c.category,
        question: c.question,
        expectedTool: expected,
        actualTool: "network_error",
        passed: false,
        latencyMs: elapsed,
        error: (err as Error).message,
      });
    }
  }

  // Print Scorecard
  console.log("| ID  | Category                   | Expected Tool  | Actual Tool    | Status | Latency |");
  console.log("|:----|:---------------------------|:---------------|:---------------|:-------|:--------|");
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(
      `| ${r.id.padEnd(3)} | ${r.category.padEnd(26)} | ${r.expectedTool.padEnd(14)} | ${r.actualTool.padEnd(14)} | ${status.padEnd(6)} | ${r.latencyMs.toString().padStart(5)}ms |`,
    );
  }

  console.log("");
  const passRate = ((passedCount / results.length) * 100).toFixed(1);
  const avgLatency = Math.round(results.reduce((a, b) => a + b.latencyMs, 0) / results.length);
  console.log(`Summary: ${passedCount}/${results.length} passed (${passRate}%) | Avg Latency: ${avgLatency}ms`);

  if (passedCount < results.length) {
    console.log("\nFailed cases:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - [${r.id}] "${r.question}": expected ${r.expectedTool}, got ${r.actualTool} (${r.error ?? "mismatch"})`);
    }
  }
}

runEval().catch((err) => {
  console.error("Live evaluation failed to run:", err.message);
  console.error("\nMake sure local server is running with remote Workers AI:");
  console.error("  npx wrangler dev --remote");
  process.exit(1);
});
