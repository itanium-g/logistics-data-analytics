/**
 * Opt-in live routing gate. Checks canonical plans AND computed facts.
 * No HTTP validation error is counted as a successful unsupported decision.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { AskResponse, QueryResponse } from "../src/shared/contracts.ts";
interface EvalCase {
  id: string;
  question: string;
  category: string;
  expected_tool: string;
  expected_plan?: Record<string, unknown>;
  expected_chart?: string;
  acceptable_alternatives?: string[];
  expected_facts?: Record<string, unknown>;
}
export function validateCase(
  c: EvalCase,
  body: AskResponse,
  reference?: QueryResponse,
): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  check(
    body.tool === c.expected_tool ||
      (c.acceptable_alternatives ?? []).includes(body.tool),
    "tool: expected " + c.expected_tool + ", got " + body.tool,
  );
  if (errors.length) return errors;
  const q = body.query,
    f = body.forecast;
  if (q || f) {
    const plan = (q?.plan ?? f) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(c.expected_plan ?? {}))
      check(
        isDeepStrictEqual(plan[key], value),
        "plan." +
          key +
          ": expected " +
          JSON.stringify(value) +
          ", got " +
          JSON.stringify(plan[key]),
      );
  } else
    check(
      body.query === null && body.forecast === null,
      "non-computational response executed a tool",
    );
  if (c.expected_chart)
    check(q?.chart.hint === c.expected_chart, "chart mismatch");
  const facts = c.expected_facts ?? {};
  const metric = (id: string) => q?.summary.find((m) => m.metric === id);
  const value = q?.summary[0];
  const first = q?.rows[0];
  const last = q?.rows.at(-1);
  const close = (actual: unknown, expected: number) =>
    typeof actual === "number" && Math.abs(actual - expected) < 1e-8;
  for (const [key, expected] of Object.entries(facts)) {
    let actual: unknown;
    switch (key) {
      case "total_orders":
      case "delivered_orders":
        actual = metric(key)?.value;
        break;
      case "on_time_rate_numerator":
        actual = metric("on_time_rate")?.numerator;
        break;
      case "on_time_rate_denominator":
        actual = metric("on_time_rate")?.denominator;
        break;
      case "on_time_rate_percent":
        actual = ((metric("on_time_rate")?.value ?? 0) * 100).toFixed(2) + "%";
        break;
      case "avg_delivery_days":
        actual = metric("avg_delivery_days")?.value?.toFixed(2) + " days";
        break;
      case "eligible_records":
        actual = value?.eligible_count;
        break;
      case "resolved_from":
        actual = q?.scope.from;
        break;
      case "resolved_to":
        actual = q?.scope.to;
        break;
      case "sum_of_weekly_values":
      case "sum":
        actual = q?.rows.reduce(
          (sum, row) => sum + (row.metrics[0]?.value ?? 0),
          0,
        );
        break;
      case "top_group":
        actual = first?.key;
        break;
      case "top_numerator":
        actual = first?.metrics[0]?.numerator;
        break;
      case "top_denominator":
        actual = first?.metrics[0]?.denominator;
        break;
      case "top_percent":
        actual = ((first?.metrics[0]?.value ?? 0) * 100).toFixed(2) + "%";
        break;
      case "total_groups":
        actual = q?.total_groups;
        break;
      case "value":
        actual = value?.value;
        if (typeof expected === "string") {
          check(
            isDeepStrictEqual(q?.summary, reference?.summary),
            "deterministic API parity",
          );
          continue;
        }
        break;
      case "buckets":
        actual = q?.rows.length;
        break;
      case "first_bucket":
        actual = first?.key;
        break;
      case "first_value":
        actual = first?.metrics[0]?.value;
        break;
      case "last_bucket":
        actual = last?.key;
        break;
      case "last_value":
        actual = last?.metrics[0]?.value;
        break;
      case "delivered":
      case "delayed":
      case "in_transit":
      case "exception":
      case "canceled":
        actual = q?.rows.find((row) => row.key === key)?.metrics[0]?.value;
        break;
      case "method":
        actual = f?.method.id;
        break;
      case "forecast_months":
        actual = f?.forecast.map((p) => p.month);
        break;
      case "monthly_units":
        check(close(f?.monthly_forecast_units, 7 / 12), "monthly units");
        continue;
      case "base_demand_units":
        check(close(f?.base_demand_units, 7 / 3), "base demand");
        continue;
      case "coverage_target_units":
        actual = f?.coverage_target_units;
        break;
      case "as_of_date":
        actual = f?.as_of_date;
        break;
      case "missing":
        actual = body.clarification?.missing;
        check(!/\d/.test(body.answer), "clarification contains a number");
        break;
      case "reason_mentions":
        check(
          /promised|contractual|SLA/i.test(body.unsupported?.reason ?? ""),
          "missing SLA explanation",
        );
        continue;
      case "alternative_mentions":
        check(
          /status|proxy/i.test(body.unsupported?.alternative ?? ""),
          "missing status-proxy alternative",
        );
        continue;
      default:
        errors.push("unimplemented fact assertion: " + key);
        continue;
    }
    check(
      isDeepStrictEqual(actual, expected),
      "fact." +
        key +
        ": expected " +
        JSON.stringify(expected) +
        ", got " +
        JSON.stringify(actual),
    );
  }
  return errors;
}
async function runEval() {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
  };
  const endpoint = option("--endpoint", "http://localhost:5173/api/ask");
  const output = option("--output", ".generated/evidence/live-evaluation.json");
  const repeats = Number(option("--repeat-critical", "0"));
  const data = JSON.parse(readFileSync("evals/cases.json", "utf8")) as {
    cases: EvalCase[];
  };
  const cases = [...data.cases];
  const critical = ["S01", "S05", "S06", "S07", "S10", "A01", "U01"];
  for (let i = 0; i < repeats; i++)
    cases.push(
      ...data.cases
        .filter((c) => critical.includes(c.id))
        .map((c) => ({
          ...c,
          id: c.id + "-repeat" + (i + 1),
          question: c.id === "S01" ? "How many orders are there?" : c.question,
        })),
    );
  const results: Record<string, unknown>[] = [];
  const post = async (path: string, body: unknown) =>
    fetch(new URL(path, endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  const beforeResponse = await post("/api/query", {
    metrics: ["total_orders"],
    breakdown: "status",
  });
  if (!beforeResponse.ok) throw new Error("Deterministic baseline unavailable");
  const before = (await beforeResponse.json()) as QueryResponse;
  for (const c of cases) {
    const start = performance.now();
    try {
      const response = await post("/api/ask", {
        question: c.question,
        date_context: "dataset",
      });
      const body = (await response.json()) as AskResponse & {
        error?: { code: string; message: string };
      };
      let errors: string[] = [];
      if (!response.ok)
        errors = [
          "HTTP " +
            response.status +
            " " +
            body.error?.code +
            ": " +
            body.error?.message,
        ];
      else {
        let reference: QueryResponse | undefined;
        if (
          c.expected_facts?.value &&
          typeof c.expected_facts.value === "string"
        )
          reference = (await (
            await post("/api/query", c.expected_plan)
          ).json()) as QueryResponse;
        errors = validateCase(c, body as AskResponse, reference);
      }
      const row = {
        id: c.id,
        question: c.question,
        status: response.status,
        passed: errors.length === 0,
        latency_ms: Math.round(performance.now() - start),
        errors,
        response: body,
      };
      results.push(row);
      console.log(
        JSON.stringify({
          id: row.id,
          passed: row.passed,
          latency_ms: row.latency_ms,
          errors,
        }),
      );
      if (
        ["rate_limited", "provider_account_quota"].includes(
          body.error?.code ?? "",
        )
      ) {
        console.error(
          "Stopping on application/account quota; remaining cases are NOT counted as passed.",
        );
        break;
      }
    } catch (error) {
      results.push({ id: c.id, passed: false, error: String(error) });
    }
  }
  const after = (await (
    await post("/api/query", { metrics: ["total_orders"], breakdown: "status" })
  ).json()) as QueryResponse;
  const datasetUnchanged =
    isDeepStrictEqual(before.rows, after.rows) &&
    isDeepStrictEqual(before.summary, after.summary);
  const passed = results.filter((r) => r.passed).length;
  const report = {
    timestamp: new Date().toISOString(),
    endpoint,
    expected_cases: cases.length,
    executed_cases: results.length,
    passed,
    dataset_unchanged: datasetUnchanged,
    results,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    "Live AI: " +
      passed +
      "/" +
      cases.length +
      "; dataset unchanged: " +
      datasetUnchanged +
      "; report: " +
      output,
  );
  if (passed !== cases.length || !datasetUnchanged) process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  runEval().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
