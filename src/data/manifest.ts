/**
 * Provenance manifest access.
 *
 * The importer writes one manifest row describing the imported dataset. The API
 * reads it rather than hard-coding dataset facts, so a re-import with different
 * data cannot leave stale coverage or vocabulary in the responses. The stored
 * JSON is validated on read: a stale or partial manifest fails loudly instead of
 * producing a response with missing scope information.
 */
import { z } from "zod";
import {
  DEFAULT_ROW_LIMIT,
  DIMENSIONS,
  DATE_CONTEXTS,
  DATE_FIELDS,
  MAX_FILTERS,
  MAX_FILTER_VALUES,
  MAX_METRICS_PER_QUERY,
  MAX_ROW_LIMIT,
  RELATIVE_RANGES,
  REQUIRED_KPI_METRICS,
  TIME_GRAINS,
  type MetaResponse,
} from "../shared/contracts.ts";
import type { SqlDb } from "../shared/db.ts";
import { metricMetaList } from "../domain/metrics.ts";

const manifestSchema = z.object({
  data_version: z.string().min(1),
  metric_version: z.string().min(1),
  imported_at: z.string().min(1),
  source: z.object({
    file: z.string(),
    sha256: z.string(),
    bytes: z.number().int().nonnegative(),
    checksum_matches_supplied_fixture: z.boolean(),
  }),
  observed: z.object({
    row_count: z.number().int().nonnegative(),
    order_date_min: z.string(),
    order_date_max: z.string(),
    delivery_date_max: z.string().nullable(),
  }),
  assumed_coverage: z.object({
    start: z.string(),
    end: z.string(),
    status: z.string(),
    basis: z.string(),
  }),
  dataset_reference_date: z.string(),
  vocabulary: z.object({
    carriers: z.array(z.string()),
    regions: z.array(z.string()),
    product_categories: z.array(z.string()),
    warehouses: z.array(z.string()),
    clients: z.array(z.string()),
    statuses: z.array(z.string()),
    destination_cities: z.array(z.string()),
    skus: z.array(z.string()),
    sku_count: z.number().int().nonnegative(),
  }),
  assumptions: z.array(z.string()),
});

export type StoredManifest = z.infer<typeof manifestSchema>;

export class ManifestUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestUnavailableError";
  }
}

export async function readManifest(db: SqlDb): Promise<StoredManifest> {
  const row = await db.first<{ manifest_json: string }>(
    "SELECT manifest_json FROM data_manifest WHERE id = 1",
  );
  if (row === null) {
    throw new ManifestUnavailableError(
      "No data manifest is present. Run the importer and apply the generated seed before querying.",
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(row.manifest_json);
  } catch {
    throw new ManifestUnavailableError("The stored data manifest is not valid JSON.");
  }

  const result = manifestSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ManifestUnavailableError(
      `The stored data manifest does not match the expected shape: ${result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

/** Dimension values the caller may filter on, resolved from the imported data. */
export interface FilterVocabulary {
  readonly carrier: readonly string[];
  readonly region: readonly string[];
  readonly product_category: readonly string[];
  readonly warehouse: readonly string[];
  readonly client_id: readonly string[];
  readonly status: readonly string[];
  readonly destination_city: readonly string[];
}

export function filterVocabulary(manifest: StoredManifest): FilterVocabulary {
  return {
    carrier: manifest.vocabulary.carriers,
    region: manifest.vocabulary.regions,
    product_category: manifest.vocabulary.product_categories,
    warehouse: manifest.vocabulary.warehouses,
    client_id: manifest.vocabulary.clients,
    status: manifest.vocabulary.statuses,
    destination_city: manifest.vocabulary.destination_cities,
  };
}

export function buildMetaResponse(manifest: StoredManifest): MetaResponse {
  return {
    data_version: manifest.data_version,
    metric_version: manifest.metric_version,
    imported_at: manifest.imported_at,
    source: {
      file: manifest.source.file,
      sha256: manifest.source.sha256,
      checksum_matches_supplied_fixture: manifest.source.checksum_matches_supplied_fixture,
    },
    metrics: metricMetaList(),
    required_kpi_metrics: [...REQUIRED_KPI_METRICS],
    dimensions: [...DIMENSIONS],
    time_grains: [...TIME_GRAINS],
    date_fields: [...DATE_FIELDS],
    date_contexts: [...DATE_CONTEXTS],
    relative_ranges: [...RELATIVE_RANGES],
    limits: {
      max_metrics: MAX_METRICS_PER_QUERY,
      max_filters: MAX_FILTERS,
      max_filter_values: MAX_FILTER_VALUES,
      max_row_limit: MAX_ROW_LIMIT,
      default_row_limit: DEFAULT_ROW_LIMIT,
    },
    observed: {
      row_count: manifest.observed.row_count,
      order_date_min: manifest.observed.order_date_min,
      order_date_max: manifest.observed.order_date_max,
      delivery_date_max: manifest.observed.delivery_date_max,
    },
    assumed_coverage: manifest.assumed_coverage,
    dataset_reference_date: manifest.dataset_reference_date,
    vocabulary: {
      carriers: manifest.vocabulary.carriers,
      regions: manifest.vocabulary.regions,
      product_categories: manifest.vocabulary.product_categories,
      warehouses: manifest.vocabulary.warehouses,
      clients: manifest.vocabulary.clients,
      statuses: manifest.vocabulary.statuses,
      skus: manifest.vocabulary.skus,
      sku_count: manifest.vocabulary.sku_count,
    },
    assumptions: manifest.assumptions,
  };
}
