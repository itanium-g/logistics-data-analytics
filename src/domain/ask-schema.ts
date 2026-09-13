/**
 * Strict request validation for the natural-language endpoint.
 *
 * The question is bounded before it reaches a prompt, and the date context is a
 * closed enum so a caller cannot invent an anchoring mode.
 */
import { z } from "zod";
import { DATE_CONTEXTS, MAX_QUESTION_CHARS } from "../shared/contracts.ts";
import type { FieldIssue, ParseFailure, ParseSuccess } from "./query-schema.ts";

export const askRequestSchema = z.strictObject({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  date_context: z.enum(DATE_CONTEXTS).default("dataset"),
});

export type AskRequestInput = z.input<typeof askRequestSchema>;
export type AskRequest = z.output<typeof askRequestSchema>;

export function parseAskRequest(input: unknown): ParseSuccess<AskRequest> | ParseFailure {
  const result = askRequestSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const issues: FieldIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
  return { ok: false, issues };
}
