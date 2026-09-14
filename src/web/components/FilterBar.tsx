import { useState } from "react";
import type {
  DateContext,
  DateField,
  Dimension,
  MetaResponse,
  RelativeRange,
} from "../../shared/contracts.ts";
import { DIMENSION_LABELS } from "../../domain/chart.ts";
import { Icon } from "./Icons.tsx";

/** Dimensions offered by dashboard filters, in display order. */
export const FILTER_DIMENSIONS = [
  "carrier",
  "region",
  "product_category",
  "warehouse",
  "status",
] as const satisfies readonly Dimension[];

export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

export interface DashboardScope {
  readonly relative_range: RelativeRange;
  readonly date_context: DateContext;
  readonly date_field: DateField;
  readonly selections: Readonly<Partial<Record<FilterDimension, string>>>;
}

export const DEFAULT_SCOPE: DashboardScope = {
  relative_range: "all_time",
  date_context: "dataset",
  date_field: "order_date",
  selections: {},
};

export const RANGE_LABELS: Readonly<Record<RelativeRange, string>> = {
  all_time: "All available dates",
  last_month: "Last complete month",
  last_3_months: "Last 3 complete months",
  last_6_months: "Last 6 complete months",
  last_12_months: "Last 12 complete months",
};

function vocabularyFor(meta: MetaResponse, dimension: FilterDimension): readonly string[] {
  switch (dimension) {
    case "carrier":
      return meta.vocabulary.carriers;
    case "region":
      return meta.vocabulary.regions;
    case "product_category":
      return meta.vocabulary.product_categories;
    case "warehouse":
      return meta.vocabulary.warehouses;
    case "status":
      return meta.vocabulary.statuses;
  }
}

export function isDefaultScope(scope: DashboardScope): boolean {
  return (
    scope.relative_range === DEFAULT_SCOPE.relative_range &&
    scope.date_context === DEFAULT_SCOPE.date_context &&
    scope.date_field === DEFAULT_SCOPE.date_field &&
    Object.keys(scope.selections).length === 0
  );
}

export function scopeSummary(scope: DashboardScope, meta: MetaResponse): string {
  const dateContext =
    scope.date_context === "dataset"
      ? `dataset · ref ${meta.dataset_reference_date}`
      : "current UTC";
  const dateField = scope.date_field === "order_date" ? "order date" : "delivery date";
  const filters = Object.entries(scope.selections)
    .filter((entry): entry is [FilterDimension, string] => typeof entry[1] === "string")
    .map(([dimension, value]) => `${DIMENSION_LABELS[dimension]} ${value}`)
    .join(", ");
  return `${RANGE_LABELS[scope.relative_range]} · ${dateContext} · ${dateField}${
    filters === "" ? "" : ` · ${filters}`
  }`;
}

interface FilterBarProps {
  readonly meta: MetaResponse;
  readonly scope: DashboardScope;
  readonly onChange: (scope: DashboardScope) => void;
  readonly disabled: boolean;
}

type RemovableField = "relative_range" | "date_context" | "date_field" | FilterDimension;

/**
 * Compact, immediate-apply scope controls. The DOM contains one instance of
 * every input; CSS changes which controls are visible at narrow widths.
 */
export function FilterBar({ meta, scope, onChange, disabled }: FilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeCount =
    (scope.relative_range !== DEFAULT_SCOPE.relative_range ? 1 : 0) +
    (scope.date_context !== DEFAULT_SCOPE.date_context ? 1 : 0) +
    (scope.date_field !== DEFAULT_SCOPE.date_field ? 1 : 0) +
    Object.keys(scope.selections).length;
  const advancedId = "advanced-filter-fields";

  const setSelection = (dimension: FilterDimension, value: string): void => {
    const next = { ...scope.selections };
    if (value === "") delete next[dimension];
    else next[dimension] = value;
    onChange({ ...scope, selections: next });
  };

  const removeField = (field: RemovableField): void => {
    if (field === "relative_range") {
      onChange({ ...scope, relative_range: DEFAULT_SCOPE.relative_range });
    } else if (field === "date_context") {
      onChange({ ...scope, date_context: DEFAULT_SCOPE.date_context });
    } else if (field === "date_field") {
      onChange({ ...scope, date_field: DEFAULT_SCOPE.date_field });
    } else {
      const next = { ...scope.selections };
      delete next[field];
      onChange({ ...scope, selections: next });
    }
  };

  const scopeChip = (
    label: string,
    field: RemovableField,
    removable: boolean,
    ariaLabel: string,
  ) =>
    removable ? (
      <button
        type="button"
        className="scope-chip scope-chip-button"
        onClick={() => removeField(field)}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <span>{label}</span>
        <span aria-hidden="true">×</span>
      </button>
    ) : (
      <span className="scope-chip" key={String(field)}>{label}</span>
    );

  return (
    <section
      className={`filter-toolbar${advancedOpen ? " is-advanced-open" : ""}`}
      aria-labelledby="filters-heading"
      data-filter-open={advancedOpen}
    >
      <div className="filters-header">
        <div>
          <p className="eyebrow">Scope controls</p>
          <h2 id="filters-heading">Filter results</h2>
          <p className="filters-context-line">
            Dataset dates · relative ranges anchor to {meta.dataset_reference_date}
          </p>
        </div>
        <div className="filters-actions">
          <button
            type="button"
            className="secondary-button filters-toggle"
            aria-expanded={advancedOpen}
            aria-controls={advancedId}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <Icon name="filter" size={15} />
            <span className="filters-toggle-full">More filters</span>
            <span className="filters-toggle-mobile">Filters</span>
            {activeCount > 0 && <span className="control-count">{activeCount}</span>}
            <span className="toggle-chevron" aria-hidden="true">{advancedOpen ? "−" : "+"}</span>
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => onChange(DEFAULT_SCOPE)}
            disabled={disabled || isDefaultScope(scope)}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="filter-fields" id={advancedId}>
        <label className="filter-field filter-field-range" htmlFor="filter-range">
          <span>Date range</span>
          <select
            id="filter-range"
            value={scope.relative_range}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...scope, relative_range: event.target.value as RelativeRange })
            }
          >
            {Object.entries(RANGE_LABELS).map(([range, label]) => (
              <option key={range} value={range}>{label}</option>
            ))}
          </select>
        </label>

        <label className="filter-field filter-field-primary" htmlFor="filter-carrier">
          <span>Carrier</span>
          <select
            id="filter-carrier"
            value={scope.selections.carrier ?? ""}
            disabled={disabled}
            onChange={(event) => setSelection("carrier", event.target.value)}
          >
            <option value="">All carriers</option>
            {vocabularyFor(meta, "carrier").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="filter-field filter-field-primary" htmlFor="filter-region">
          <span>Region</span>
          <select
            id="filter-region"
            value={scope.selections.region ?? ""}
            disabled={disabled}
            onChange={(event) => setSelection("region", event.target.value)}
          >
            <option value="">All regions</option>
            {vocabularyFor(meta, "region").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="filter-field filter-field-advanced" htmlFor="filter-context">
          <span>Date context</span>
          <select
            id="filter-context"
            value={scope.date_context}
            disabled={disabled}
            onChange={(event) => onChange({ ...scope, date_context: event.target.value as DateContext })}
          >
            <option value="dataset">Dataset · ref {meta.dataset_reference_date}</option>
            <option value="current">Current UTC · today</option>
          </select>
        </label>

        <label className="filter-field filter-field-advanced" htmlFor="filter-datefield">
          <span>Date basis</span>
          <select
            id="filter-datefield"
            value={scope.date_field}
            disabled={disabled}
            onChange={(event) => onChange({ ...scope, date_field: event.target.value as DateField })}
          >
            <option value="order_date">Order date · cohorts</option>
            <option value="delivery_date">Delivery date · events</option>
          </select>
        </label>

        <label className="filter-field filter-field-advanced" htmlFor="filter-product_category">
          <span>Category</span>
          <select
            id="filter-product_category"
            value={scope.selections.product_category ?? ""}
            disabled={disabled}
            onChange={(event) => setSelection("product_category", event.target.value)}
          >
            <option value="">All categories</option>
            {vocabularyFor(meta, "product_category").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="filter-field filter-field-advanced" htmlFor="filter-warehouse">
          <span>Warehouse</span>
          <select
            id="filter-warehouse"
            value={scope.selections.warehouse ?? ""}
            disabled={disabled}
            onChange={(event) => setSelection("warehouse", event.target.value)}
          >
            <option value="">All warehouses</option>
            {vocabularyFor(meta, "warehouse").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="filter-field filter-field-advanced" htmlFor="filter-status">
          <span>Status</span>
          <select
            id="filter-status"
            value={scope.selections.status ?? ""}
            disabled={disabled}
            onChange={(event) => setSelection("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {vocabularyFor(meta, "status").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <div className="active-scope" aria-live="polite">
        <span className="active-scope-label">Selected scope</span>
        {scopeChip(
          RANGE_LABELS[scope.relative_range],
          "relative_range",
          scope.relative_range !== DEFAULT_SCOPE.relative_range,
          `Remove ${RANGE_LABELS[scope.relative_range].toLowerCase()} filter`,
        )}
        {scopeChip(
          scope.date_context === "dataset" ? "Dataset dates" : "Current UTC",
          "date_context",
          scope.date_context !== DEFAULT_SCOPE.date_context,
          "Remove date context filter",
        )}
        {scopeChip(
          scope.date_field === "order_date" ? "Order date" : "Delivery date",
          "date_field",
          scope.date_field !== DEFAULT_SCOPE.date_field,
          "Remove date basis filter",
        )}
        {Object.entries(scope.selections).map(([dimension, value]) => (
          <span className="scope-chip-wrap" key={dimension}>
            {scopeChip(
              `${DIMENSION_LABELS[dimension as FilterDimension]}: ${value}`,
              dimension as FilterDimension,
              true,
              `Remove ${DIMENSION_LABELS[dimension as FilterDimension].toLowerCase()} ${value} filter`,
            )}
          </span>
        ))}
      </div>

      <details className="filters-explanation">
        <summary>How dates are interpreted</summary>
        <p>
          Dataset mode anchors relative ranges to {meta.dataset_reference_date}, the day after the assumed coverage window {meta.assumed_coverage.start} to {meta.assumed_coverage.end}. Current mode uses today&apos;s UTC date and can legitimately return no records. Order date groups cohorts; delivery date measures delivery events.
        </p>
      </details>
    </section>
  );
}
