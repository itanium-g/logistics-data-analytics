import type {
  DateContext,
  DateField,
  Dimension,
  MetaResponse,
  RelativeRange,
} from "../../shared/contracts.ts";
import { DIMENSION_LABELS } from "../../domain/chart.ts";

/** Dimensions offered as dashboard filters, in display order. */
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

const RANGE_LABELS: Readonly<Record<RelativeRange, string>> = {
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

interface FilterBarProps {
  readonly meta: MetaResponse;
  readonly scope: DashboardScope;
  readonly onChange: (scope: DashboardScope) => void;
  readonly disabled: boolean;
}

/**
 * Every control is a select over vocabulary the server published, so the browser
 * cannot submit a value the server would have to reject.
 */
export function FilterBar({ meta, scope, onChange, disabled }: FilterBarProps) {
  const setSelection = (dimension: FilterDimension, value: string): void => {
    const next = { ...scope.selections };
    if (value === "") {
      delete next[dimension];
    } else {
      next[dimension] = value;
    }
    onChange({ ...scope, selections: next });
  };

  const activeCount = Object.keys(scope.selections).length;

  return (
    <section className="panel filters" aria-labelledby="filters-heading">
      <div className="filters-header">
        <h2 id="filters-heading">Filters and date basis</h2>
        <button
          type="button"
          className="link-button"
          onClick={() => onChange(DEFAULT_SCOPE)}
          disabled={disabled || (activeCount === 0 && scope.relative_range === "all_time")}
        >
          Reset
        </button>
      </div>

      <div className="filter-grid">
        <label htmlFor="filter-range">
          Date range
          <select
            id="filter-range"
            value={scope.relative_range}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...scope, relative_range: event.target.value as RelativeRange })
            }
          >
            {meta.relative_ranges.map((range) => (
              <option key={range} value={range}>
                {RANGE_LABELS[range]}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="filter-context">
          Date context
          <select
            id="filter-context"
            value={scope.date_context}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...scope, date_context: event.target.value as DateContext })
            }
          >
            <option value="dataset">
              Dataset mode (reference {meta.dataset_reference_date})
            </option>
            <option value="current">Current mode (today, UTC)</option>
          </select>
        </label>

        <label htmlFor="filter-datefield">
          Date field
          <select
            id="filter-datefield"
            value={scope.date_field}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...scope, date_field: event.target.value as DateField })
            }
          >
            <option value="order_date">Order date (order cohorts)</option>
            <option value="delivery_date">Delivery date (delivery events)</option>
          </select>
        </label>

        {FILTER_DIMENSIONS.map((dimension) => (
          <label key={dimension} htmlFor={`filter-${dimension}`}>
            {DIMENSION_LABELS[dimension]}
            <select
              id={`filter-${dimension}`}
              value={scope.selections[dimension] ?? ""}
              disabled={disabled}
              onChange={(event) => setSelection(dimension, event.target.value)}
            >
              <option value="">All</option>
              {vocabularyFor(meta, dimension).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <p className="filters-note">
        Dataset mode anchors relative ranges to {meta.dataset_reference_date}, the day after the
        assumed coverage window {meta.assumed_coverage.start} to {meta.assumed_coverage.end}.
        Current mode uses today&apos;s UTC date and can legitimately return no records.
      </p>
    </section>
  );
}
