/**
 * Strict request validation for the bounded query subset.
 *
 * Zod lives here rather than in the shared contract so it never enters the
 * browser bundle: the web app imports only the inferred types.
 *
 * Objects are strict. Unknown keys, wrong primitive types, unknown enum members,
 * out-of-range numbers and oversized collections are rejected before any SQL is
 * built. A caller cannot express a join, a raw expression or a second operation
 * in this shape at all.
 */
import { z } from "zod";
import {
  DATE_CONTEXTS,
  DATE_FIELDS,
  DEFAULT_ROW_LIMIT,
  DIMENSIONS,
  FILTER_OPERATORS,
  MAX_FILTERS,
  MAX_FILTER_VALUES,
  MAX_METRICS_PER_QUERY,
  MAX_ROW_LIMIT,
  METRIC_IDS,
  RELATIVE_RANGES,
  TIME_GRAINS,
} from "../shared/contracts.ts";

/** Calendar date, not a timestamp. Real-date checking happens in date-context. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date");

const filterSchema = z
  .strictObject({
    field: z.enum(DIMENSIONS),
    op: z.enum(FILTER_OPERATORS),
    values: z
      .array(z.string().min(1).max(120))
      .min(1)
      .max(MAX_FILTER_VALUES),
  })
  .refine((filter) => filter.op !== "eq" || filter.values.length === 1, {
    message: 'The "eq" operator takes exactly one value; use "in" for several',
    path: ["values"],
  });

export const queryRequestSchema = z
  .strictObject({
    metrics: z.array(z.enum(METRIC_IDS)).min(1).max(MAX_METRICS_PER_QUERY),
    breakdown: z.enum(DIMENSIONS).nullish(),
    time_grain: z.enum(TIME_GRAINS).default("none"),
    date_field: z.enum(DATE_FIELDS).default("order_date"),
    date_context: z.enum(DATE_CONTEXTS).default("dataset"),
    relative_range: z.enum(RELATIVE_RANGES).nullish(),
    date_from: isoDateSchema.nullish(),
    date_to: isoDateSchema.nullish(),
    filters: z.array(filterSchema).max(MAX_FILTERS).default([]),
    order_by: z.enum(METRIC_IDS).nullish(),
    order_dir: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(MAX_ROW_LIMIT).default(DEFAULT_ROW_LIMIT),
  })
  .refine((request) => new Set(request.metrics).size === request.metrics.length, {
    message: "metrics must be distinct",
    path: ["metrics"],
  })
  .refine(
    (request) =>
      request.order_by === null ||
      request.order_by === undefined ||
      request.metrics.includes(request.order_by),
    {
      message: "order_by must be one of the requested metrics",
      path: ["order_by"],
    },
  )
  .refine(
    (request) =>
      request.filters.length === 0 ||
      new Set(request.filters.map((filter) => filter.field)).size === request.filters.length,
    {
      message: "Each dimension may be filtered at most once",
      path: ["filters"],
    },
  );

export type QueryRequestInput = z.input<typeof queryRequestSchema>;
export type QueryRequest = z.output<typeof queryRequestSchema>;

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export interface ParseFailure {
  readonly ok: false;
  readonly issues: readonly FieldIssue[];
}

export interface ParseSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export function parseQueryRequest(
  input: unknown,
): ParseSuccess<QueryRequest> | ParseFailure {
  const result = queryRequestSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    })),
  };
}
