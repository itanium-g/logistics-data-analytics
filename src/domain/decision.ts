/**
 * The model boundary.
 *
 * A generation may do exactly one thing: choose one operation and fill its
 * arguments from closed vocabularies. It never returns a number, a SQL fragment,
 * an identifier of its own invention or prose that reaches the user as fact.
 *
 * Providers that support strict structured output generally require every
 * property to be present and objects to forbid extra properties, so the wire
 * schema carries all four branches with unused ones set to null. Normalization
 * here collapses that back to the canonical single-decision shape and rejects
 * anything ambiguous: a missing branch, a populated second branch, an unknown
 * tool, or extra keys.
 *
 * A schema-valid decision is not automatically a correct one. Domain validation
 * still runs afterwards, and a plan that parses but asks the wrong question is
 * treated as a routing failure rather than an answer.
 */
import { z } from "zod";
import {
  ASK_TOOLS,
  DATE_CONTEXTS,
  DATE_FIELDS,
  DIMENSIONS,
  FILTER_OPERATORS,
  MAX_BUFFER_PCT,
  MAX_FILTERS,
  MAX_FILTER_VALUES,
  MAX_HORIZON_MONTHS,
  MAX_METRICS_PER_QUERY,
  MAX_ROW_LIMIT,
  METRIC_IDS,
  RELATIVE_RANGES,
  TIME_GRAINS,
  type AskTool,
} from "../shared/contracts.ts";
import type { FieldIssue, ParseFailure, ParseSuccess } from "./query-schema.ts";

/* ------------------------------------------------------------- wire schema */

const wireFilter = z.strictObject({
  field: z.enum(DIMENSIONS),
  op: z.enum(FILTER_OPERATORS),
  values: z.array(z.string().min(1).max(120)).min(1).max(MAX_FILTER_VALUES),
});

const wireQuery = z.strictObject({
  metrics: z.array(z.enum(METRIC_IDS)).min(1).max(MAX_METRICS_PER_QUERY),
  breakdown: z.enum(DIMENSIONS).nullable(),
  time_grain: z.enum(TIME_GRAINS).nullable(),
  date_field: z.enum(DATE_FIELDS).nullable(),
  date_context: z.enum(DATE_CONTEXTS).nullable(),
  relative_range: z.enum(RELATIVE_RANGES).nullable(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  filters: z.array(wireFilter).max(MAX_FILTERS).nullable(),
  order_by: z.enum(METRIC_IDS).nullable(),
  order_dir: z.enum(["asc", "desc"]).nullable(),
  limit: z.number().nullable(),
});

const wireForecast = z.strictObject({
  sku: z.string().min(1).max(64),
  horizon_months: z.number().nullable(),
  buffer_pct: z.number().nullable(),
});

const wireClarify = z.strictObject({
  question: z.string().min(1).max(400),
  missing: z.string().min(1).max(120),
});

const wireUnsupported = z.strictObject({
  reason: z.string().min(1).max(400),
  alternative: z.string().min(1).max(400),
});

const wireDecisionSchema = z.strictObject({
  tool: z.enum(ASK_TOOLS),
  query: wireQuery.nullable(),
  forecast: wireForecast.nullable(),
  clarify: wireClarify.nullable(),
  unsupported: wireUnsupported.nullable(),
});

export type WireDecision = z.infer<typeof wireDecisionSchema>;

/* -------------------------------------------------------- canonical decision */

export interface QueryDecision {
  readonly tool: "query_metric";
  /** Unvalidated argument object; the canonical query validator runs next. */
  readonly query: Record<string, unknown>;
}

export interface ForecastDecision {
  readonly tool: "forecast";
  readonly forecast: Record<string, unknown>;
}

export interface ClarifyDecision {
  readonly tool: "clarify";
  readonly clarify: { readonly question: string; readonly missing: string };
}

export interface UnsupportedDecision {
  readonly tool: "unsupported";
  readonly unsupported: {
    readonly reason: string;
    readonly alternative: string;
  };
}

export type Decision =
  | QueryDecision
  | ForecastDecision
  | ClarifyDecision
  | UnsupportedDecision;

/** Strip nulls so the canonical validators apply their own defaults. */
function withoutNulls(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined) result[key] = value;
  }
  return result;
}

const BRANCH_KEYS: Readonly<Record<AskTool, keyof WireDecision>> = {
  query_metric: "query",
  forecast: "forecast",
  clarify: "clarify",
  unsupported: "unsupported",
};

/**
 * Parse raw model output text into exactly one decision.
 *
 * Rejects: non-object roots (including arrays and null), unknown tools, unknown
 * keys, a null branch for the selected tool, and a populated branch for any
 * other tool.
 */
export function parseDecision(
  raw: unknown,
): ParseSuccess<Decision> | ParseFailure {
  if (Array.isArray(raw)) {
    return {
      ok: false,
      issues: [
        {
          path: "(root)",
          message: "Expected a single decision object, received an array",
        },
      ],
    };
  }
  if (raw === null || typeof raw !== "object") {
    return {
      ok: false,
      issues: [{ path: "(root)", message: "Expected a decision object" }],
    };
  }

  const result = wireDecisionSchema.safeParse(raw);
  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    }));
    return { ok: false, issues };
  }

  const decision = result.data;
  const selected = BRANCH_KEYS[decision.tool];

  const populated = (Object.keys(BRANCH_KEYS) as AskTool[])
    .map((tool) => BRANCH_KEYS[tool])
    .filter((key) => decision[key] !== null);

  if (populated.length === 0 || !populated.includes(selected)) {
    return {
      ok: false,
      issues: [
        {
          path: selected,
          message: `tool is "${decision.tool}" but its arguments are missing`,
        },
      ],
    };
  }
  if (populated.length > 1) {
    return {
      ok: false,
      issues: [
        {
          path: "(root)",
          message: `Exactly one operation may be selected; arguments were supplied for ${populated.join(", ")}`,
        },
      ],
    };
  }

  switch (decision.tool) {
    case "query_metric":
      return {
        ok: true,
        value: {
          tool: "query_metric",
          query: withoutNulls(decision.query ?? {}),
        },
      };
    case "forecast":
      return {
        ok: true,
        value: {
          tool: "forecast",
          forecast: withoutNulls(decision.forecast ?? {}),
        },
      };
    case "clarify":
      return {
        ok: true,
        value: {
          tool: "clarify",
          clarify: decision.clarify ?? { question: "", missing: "" },
        },
      };
    case "unsupported":
      return {
        ok: true,
        value: {
          tool: "unsupported",
          unsupported: decision.unsupported ?? { reason: "", alternative: "" },
        },
      };
  }
}

/** Parse the provider's response text, then the decision within it. */
export function parseDecisionText(
  text: string,
): ParseSuccess<Decision> | ParseFailure {
  const trimmed = text.trim();
  if (trimmed === "") {
    return {
      ok: false,
      issues: [
        { path: "(root)", message: "The model returned an empty response" },
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      issues: [
        {
          path: "(root)",
          message:
            "The model response was not valid JSON, so no operation was executed",
        },
      ],
    };
  }
  return parseDecision(parsed);
}

/* --------------------------------------------------------- provider schema */

function enumProperty(
  values: readonly string[],
  description: string,
): Record<string, unknown> {
  return { type: ["string", "null"], enum: [...values, null], description };
}

/**
 * JSON Schema sent to the provider. Every property is required and additional
 * properties are forbidden, which is what strict structured-output modes demand.
 * A test asserts these enumerations stay identical to the contract constants.
 */
export const DECISION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["tool", "query", "forecast", "clarify", "unsupported"],
  properties: {
    tool: {
      type: "string",
      enum: [...ASK_TOOLS],
      description:
        "query_metric for analytics, forecast for SKU demand, clarify when a required detail is missing, unsupported when the question is outside the supported subset.",
    },
    query: {
      type: ["object", "null"],
      additionalProperties: false,
      required: [
        "metrics",
        "breakdown",
        "time_grain",
        "date_field",
        "date_context",
        "relative_range",
        "date_from",
        "date_to",
        "filters",
        "order_by",
        "order_dir",
        "limit",
      ],
      properties: {
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: MAX_METRICS_PER_QUERY,
          items: { type: "string", enum: [...METRIC_IDS] },
        },
        breakdown: enumProperty(DIMENSIONS, "Group by one dimension, or null."),
        time_grain: enumProperty(
          TIME_GRAINS,
          "Time bucket, or null for a single value.",
        ),
        date_field: enumProperty(
          DATE_FIELDS,
          "order_date for order cohorts, delivery_date for delivery events.",
        ),
        date_context: enumProperty(
          DATE_CONTEXTS,
          "dataset or current date anchoring.",
        ),
        relative_range: enumProperty(
          RELATIVE_RANGES,
          "Relative range in whole complete calendar months, or null when explicit dates are given.",
        ),
        date_from: {
          type: ["string", "null"],
          description: "Inclusive YYYY-MM-DD lower bound, or null.",
        },
        date_to: {
          type: ["string", "null"],
          description: "Inclusive YYYY-MM-DD upper bound, or null.",
        },
        filters: {
          type: ["array", "null"],
          maxItems: MAX_FILTERS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "values"],
            properties: {
              field: { type: "string", enum: [...DIMENSIONS] },
              op: { type: "string", enum: [...FILTER_OPERATORS] },
              values: {
                type: "array",
                minItems: 1,
                maxItems: MAX_FILTER_VALUES,
                items: { type: "string" },
              },
            },
          },
        },
        order_by: enumProperty(
          METRIC_IDS,
          "Rank by one requested metric, or null.",
        ),
        order_dir: {
          type: ["string", "null"],
          enum: ["asc", "desc", null],
        },
        limit: {
          type: ["number", "null"],
          description: `Row limit from 1 to ${MAX_ROW_LIMIT}, or null for the default.`,
        },
      },
    },
    forecast: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["sku", "horizon_months", "buffer_pct"],
      properties: {
        sku: {
          type: "string",
          description: "Exact SKU identifier taken from the question.",
        },
        horizon_months: {
          type: ["number", "null"],
          description: `Months ahead, 1 to ${MAX_HORIZON_MONTHS}, or null for the default.`,
        },
        buffer_pct: {
          type: ["number", "null"],
          description: `Buffer percentage, 0 to ${MAX_BUFFER_PCT}, or null for the default.`,
        },
      },
    },
    clarify: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["question", "missing"],
      properties: {
        question: {
          type: "string",
          description: "One question to ask the user.",
        },
        missing: {
          type: "string",
          description: "The single missing detail, for example sku.",
        },
      },
    },
    unsupported: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["reason", "alternative"],
      properties: {
        reason: {
          type: "string",
          description: "Why this cannot be answered from the data.",
        },
        alternative: {
          type: "string",
          description:
            "The closest supported question, including its limitations. For unavailable exact SLA data use: What is the on-time delivery rate (status proxy)?",
        },
      },
    },
  },
};

/** Bounded native functions; the same wire/domain validators remain authoritative. */
export function decisionTools(
  schema = DECISION_JSON_SCHEMA,
): Record<string, unknown>[] {
  const properties = schema.properties as Record<
    string,
    Record<string, unknown>
  >;
  const descriptions = {
    query_metric:
      "Select recorded order metrics, counts, rates, averages, trends or rankings. On-time delivery rate uses on_time_rate; average delivery time uses avg_delivery_days; orders uses total_orders. No date period is required: unspecified means all_time. Never calculate values yourself.",
    forecast:
      "Compute future demand coverage for one known SKU explicitly present in the question.",
    clarify:
      "Only for a missing SKU, genuinely unspecified metric, or incompatible trend-plus-breakdown views. An ordinary named KPI, order count or unspecified time period NEVER needs clarification. Ask a useful question, not a repetition of the request.",
    unsupported:
      "Explain unavailable data or disallowed SQL/write requests and offer a supported alternative.",
  };
  return Object.entries(BRANCH_KEYS).map(([name, branch]) => ({
    type: "function",
    function: {
      name,
      description: descriptions[name as AskTool],
      parameters: compactParameters(properties[branch]!, name),
    },
  }));
}

function compactParameters(
  schema: Record<string, unknown>,
  tool: string,
): Record<string, unknown> {
  const compact = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.filter((item) => item !== null).map(compact);
    if (value === null || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] =
        key === "type" && Array.isArray(item)
          ? item.find((type) => type !== "null")
          : compact(item);
    }
    return output;
  };
  const result = compact(schema) as Record<string, unknown>;
  const props = result.properties as Record<string, unknown>;
  if (tool === "query_metric") {
    delete props.date_context;
    result.required = ["metrics"];
  }
  if (tool === "forecast") result.required = ["sku"];
  return result;
}

/** Convert exactly one native function call into the existing strict decision. */
export function toolCallDecision(name: string, args: unknown): unknown {
  if (!Object.hasOwn(BRANCH_KEYS, name)) throw new Error("unknown_tool");
  const branch = BRANCH_KEYS[name as AskTool];
  const properties = DECISION_JSON_SCHEMA.properties as Record<
    string,
    { properties: Record<string, unknown> }
  >;
  // Fill only missing optional wire keys; preserve unknown keys for strict rejection.
  const normalized =
    args && typeof args === "object" && !Array.isArray(args)
      ? {
          ...Object.fromEntries(
            Object.keys(properties[branch]!.properties).map((key) => [
              key,
              null,
            ]),
          ),
          ...args,
        }
      : args;
  return {
    tool: name,
    query: null,
    forecast: null,
    clarify: null,
    unsupported: null,
    [branch]: normalized,
  };
}
