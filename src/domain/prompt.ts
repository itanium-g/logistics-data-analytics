/**
 * Prompt construction.
 *
 * The model receives the question, the operation contract, the date context and
 * the small filter vocabularies. It never receives source rows, computed results,
 * database credentials or the full 355-item SKU list: SKU-shaped tokens are
 * extracted from the question and validated server-side instead.
 *
 * Input size is bounded before the call. Token counting is a deliberately
 * conservative character-based estimate rather than a provider-specific
 * tokenizer, so the guard errs towards refusing a borderline request.
 */
import {
  DATE_CONTEXTS,
  DATE_FIELDS,
  DIMENSIONS,
  MAX_BUFFER_PCT,
  MAX_FILTERS,
  MAX_HORIZON_MONTHS,
  MAX_METRICS_PER_QUERY,
  MAX_ROW_LIMIT,
  RELATIVE_RANGES,
  TIME_GRAINS,
} from "../shared/contracts.ts";
import { filterVocabulary, type StoredManifest } from "../data/manifest.ts";
import { listMetrics } from "./metrics.ts";

/**
 * Conservative token estimate. Real tokenizers average more than three
 * characters per token for English prose and JSON, so dividing by three
 * over-counts, which is the safe direction for an admission guard.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** SKU-shaped tokens, for example CRAYON-0008. */
const SKU_PATTERN = /\b[A-Za-z][A-Za-z0-9]{1,15}-\d{2,6}\b/g;

export function extractSkuCandidates(question: string, known: readonly string[]): readonly string[] {
  const matches = question.match(SKU_PATTERN) ?? [];
  const upper = new Set(matches.map((match) => match.toUpperCase()));
  // Only identifiers that exist in the imported data are passed on.
  return known.filter((sku) => upper.has(sku.toUpperCase())).slice(0, 5);
}

export const SYSTEM_PROMPT = [
  "You are a router for a logistics analytics application.",
  "Your only job is to translate one question into one operation, using the JSON schema supplied.",
  "You must never compute, estimate or state a number, percentage, date range total or ranking yourself: the application computes every value and writes the answer text.",
  "Choose exactly one tool and fill only that tool's arguments; set the other three to null.",
  "Use query_metric for counts, rates, averages, trends and rankings over recorded orders.",
  "Use forecast only when the question asks about future demand for one specific SKU identifier that appears in the question.",
  "Use clarify when a required detail is genuinely missing, for example a forecast question with no SKU. Never guess a SKU or invent a filter value.",
  "Use unsupported when the question needs data the dataset does not contain, such as an exact contractual SLA rate, promised delivery dates, causes, costs of delay, or customer identities.",
  "Pick date_field delivery_date when the question is about delivery events such as deliveries that arrived late in a period, and order_date when it is about orders placed in a period.",
  "Never request a time_grain together with a breakdown, and never rank a time series: choose either the trend or the breakdown.",
  "Respond with the JSON object only, no prose and no code fences.",
].join(" ");

export interface PromptInput {
  readonly question: string;
  readonly manifest: StoredManifest;
  readonly dateContext: "dataset" | "current";
  readonly referenceDate: string;
}

export interface BuiltPrompt {
  readonly system: string;
  readonly user: string;
  readonly skuCandidates: readonly string[];
  readonly estimatedInputTokens: number;
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const vocabulary = filterVocabulary(input.manifest);
  const skuCandidates = extractSkuCandidates(input.question, input.manifest.vocabulary.skus);

  const metricLines = listMetrics().map(
    (metric) => `- ${metric.id} (${metric.unit}): ${metric.label}`,
  );

  const lines = [
    `Question: ${input.question}`,
    "",
    "Date context:",
    `- mode: ${input.dateContext}`,
    `- reference date for relative expressions: ${input.referenceDate}`,
    `- assumed data coverage: ${input.manifest.assumed_coverage.start} to ${input.manifest.assumed_coverage.end} (${input.manifest.assumed_coverage.status})`,
    `- relative ranges resolve to whole complete calendar months: ${RELATIVE_RANGES.join(", ")}`,
    "",
    "Metrics:",
    ...metricLines,
    "",
    "Dimensions for breakdown and filters:",
    `- ${DIMENSIONS.join(", ")}`,
    "",
    "Filter values:",
    `- carrier: ${vocabulary.carrier.join(", ")}`,
    `- region: ${vocabulary.region.join(", ")}`,
    `- product_category: ${vocabulary.product_category.join(", ")}`,
    `- warehouse: ${vocabulary.warehouse.join(", ")}`,
    `- status: ${vocabulary.status.join(", ")}`,
    `- client_id: ${vocabulary.client_id.length} known client identifiers of the form CL-1001`,
    `- destination_city: ${vocabulary.destination_city.length} known cities`,
    `- sku: ${input.manifest.vocabulary.sku_count} known identifiers; only these appear in the question: ${
      skuCandidates.length > 0 ? skuCandidates.join(", ") : "none"
    }`,
    "",
    "Other fields:",
    `- time_grain: ${TIME_GRAINS.join(", ")}`,
    `- date_field: ${DATE_FIELDS.join(", ")}`,
    `- date_context: ${DATE_CONTEXTS.join(", ")}`,
    `- at most ${MAX_METRICS_PER_QUERY} metrics, ${MAX_FILTERS} filters, limit 1 to ${MAX_ROW_LIMIT}`,
    `- forecast: horizon_months 1 to ${MAX_HORIZON_MONTHS}, buffer_pct 0 to ${MAX_BUFFER_PCT}`,
    "",
    "Return the decision JSON now.",
  ];

  const user = lines.join("\n");
  return {
    system: SYSTEM_PROMPT,
    user,
    skuCandidates,
    estimatedInputTokens: estimateTokens(SYSTEM_PROMPT) + estimateTokens(user),
  };
}
