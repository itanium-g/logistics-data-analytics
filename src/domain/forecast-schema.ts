/**
 * Strict request validation for the forecast tool.
 *
 * Only a known SKU, a horizon of one to four months and a buffer percentage are
 * accepted. Category scope, custom start dates and arbitrary methods are out of
 * the supported subset and are rejected rather than approximated.
 */
import { z } from "zod";
import {
  DEFAULT_BUFFER_PCT,
  DEFAULT_HORIZON_MONTHS,
  MAX_BUFFER_PCT,
  MAX_HORIZON_MONTHS,
} from "../shared/contracts.ts";
import type { FieldIssue, ParseFailure, ParseSuccess } from "./query-schema.ts";

export const forecastRequestSchema = z.strictObject({
  scope: z.literal("sku").default("sku"),
  /** Exact identifier. Membership is checked against the imported data. */
  sku: z.string().trim().min(1).max(64),
  horizon_months: z
    .number()
    .int()
    .min(1)
    .max(MAX_HORIZON_MONTHS)
    .default(DEFAULT_HORIZON_MONTHS),
  buffer_pct: z
    .number()
    .min(0)
    .max(MAX_BUFFER_PCT)
    .default(DEFAULT_BUFFER_PCT),
});

export type ForecastRequestInput = z.input<typeof forecastRequestSchema>;
export type ForecastRequest = z.output<typeof forecastRequestSchema>;

export function parseForecastRequest(
  input: unknown,
): ParseSuccess<ForecastRequest> | ParseFailure {
  const result = forecastRequestSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const issues: FieldIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
  return { ok: false, issues };
}
