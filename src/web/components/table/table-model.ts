/** Pure, response-derived state helpers for the dashboard data table. */

export type SortDirection = "asc" | "desc";

export interface ResponseRowLike {
  readonly id?: unknown;
  readonly key?: unknown;
  readonly label?: unknown;
  readonly readableLabel?: unknown;
  readonly canonicalKey?: unknown;
}

export type RowWithStableId<T> = T & {
  readonly rowId: string;
  readonly readableLabel: string;
  readonly canonicalKey: string | null;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowIdentity(row: ResponseRowLike): string {
  return textValue(row.id) ?? textValue(row.canonicalKey) ?? textValue(row.key) ?? "scope";
}

/** A deterministic ID based on the server's canonical row identity. */
export function stableResponseRowId(row: ResponseRowLike, duplicateNumber = 0): string {
  const base = `row:${encodeURIComponent(rowIdentity(row))}`;
  return duplicateNumber === 0 ? base : `${base}:${duplicateNumber}`;
}

/** Adds IDs and search labels without modifying the response rows. */
export function addStableRowIds<T extends ResponseRowLike>(
  rows: readonly T[],
): readonly RowWithStableId<T>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const identity = rowIdentity(row);
    const duplicateNumber = seen.get(identity) ?? 0;
    seen.set(identity, duplicateNumber + 1);
    return {
      ...row,
      rowId: stableResponseRowId(row, duplicateNumber),
      readableLabel:
        textValue(row.readableLabel) ?? textValue(row.label) ?? textValue(row.key) ?? "Whole scope",
      canonicalKey: textValue(row.canonicalKey) ?? textValue(row.key),
    };
  });
}

function compareNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  direction: SortDirection,
  comparePresent: (left: T, right: T) => number,
): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing || bMissing) {
    if (aMissing && bMissing) return 0;
    return aMissing ? 1 : -1;
  }
  const result = comparePresent(a, b);
  return direction === "asc" ? result : -result;
}

/** Raw numeric comparison; missing values stay at the bottom in either direction. */
export function compareRawNumeric(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: SortDirection = "asc",
): number {
  return compareNullable(a, b, direction, (left, right) => left - right);
}

/** YYYY-MM keys sort chronologically without locale-dependent parsing. */
export function compareMonthKeys(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: SortDirection = "asc",
): number {
  return compareNullable(a, b, direction, (left, right) =>
    left === right ? 0 : left < right ? -1 : 1,
  );
}

export type ValueComparator<T> = (
  a: T | null | undefined,
  b: T | null | undefined,
  direction: SortDirection,
) => number;

/** Sorts a copy and explicitly preserves source order for equal values. */
export function sortRows<T, V>(
  rows: readonly T[],
  value: (row: T) => V | null | undefined,
  direction: SortDirection,
  compare: ValueComparator<V>,
): readonly T[] {
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const result = compare(value(left.row), value(right.row), direction);
      return result === 0 ? left.originalIndex - right.originalIndex : result;
    })
    .map(({ row }) => row);
}

export function sortRowsByNumeric<T>(
  rows: readonly T[],
  value: (row: T) => number | null | undefined,
  direction: SortDirection = "asc",
): readonly T[] {
  return sortRows(rows, value, direction, compareRawNumeric);
}

export function sortRowsByMonth<T>(
  rows: readonly T[],
  value: (row: T) => string | null | undefined,
  direction: SortDirection = "asc",
): readonly T[] {
  return sortRows(rows, value, direction, compareMonthKeys);
}

/** Returns a fresh copy in the exact order supplied by the server. */
export function restoreServerOrder<T>(rows: readonly T[]): readonly T[] {
  return rows.slice();
}

function recordValue(row: unknown, key: string): unknown {
  if (typeof row !== "object" || row === null) return undefined;
  return (row as Record<string, unknown>)[key];
}

function searchText(row: unknown, key: "readableLabel" | "canonicalKey"): string {
  const fallback = key === "readableLabel" ? "label" : "key";
  return (
    textValue(recordValue(row, key)) ?? textValue(recordValue(row, fallback)) ?? ""
  ).toLowerCase();
}

/** Searches both human-readable labels and canonical response keys. */
export function matchesTableSearch(row: unknown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") return true;
  return searchText(row, "readableLabel").includes(normalized) ||
    searchText(row, "canonicalKey").includes(normalized);
}

export type FacetSelections = Readonly<Record<string, readonly string[]>>;

export interface FilterTableRowsOptions {
  readonly search?: string;
  readonly facets?: FacetSelections;
  readonly getFacetValues?: (row: unknown, facet: string) => string | readonly string[] | null | undefined;
}

function facetValues(row: unknown, facet: string, getFacetValues?: FilterTableRowsOptions["getFacetValues"]): readonly string[] {
  const selectedValue = getFacetValues?.(row, facet) ?? recordValue(row, facet) ?? recordValue(recordValue(row, "facets"), facet);
  if (typeof selectedValue === "string") return [selectedValue];
  if (Array.isArray(selectedValue)) return selectedValue.filter((value): value is string => typeof value === "string");
  return [];
}

/** Applies OR within each facet, then AND across facets and the search query. */
export function filterTableRows<T>(
  rows: readonly T[],
  options: FilterTableRowsOptions = {},
): readonly T[] {
  const selections = options.facets ?? {};
  return rows.filter((row) => {
    if (options.search !== undefined && !matchesTableSearch(row, options.search)) return false;
    return Object.entries(selections).every(([facet, selected]) => {
      if (selected.length === 0) return true;
      const available = facetValues(row, facet, options.getFacetValues);
      return selected.some((value) => available.includes(value));
    });
  });
}

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface PaginationState {
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface PaginatedRows<T> extends PaginationState {
  readonly rows: readonly T[];
  readonly totalRows: number;
  readonly pageCount: number;
}

export function normalizePagination(
  state: Partial<PaginationState> = {},
  pageSizeOptions: readonly number[] = PAGE_SIZE_OPTIONS,
): PaginationState {
  const defaultPageSize = pageSizeOptions.includes(DEFAULT_PAGE_SIZE)
    ? DEFAULT_PAGE_SIZE
    : pageSizeOptions.find((option) => Number.isInteger(option) && option > 0) ?? DEFAULT_PAGE_SIZE;
  const requestedPageSize = state.pageSize;
  const pageSize = requestedPageSize !== undefined &&
    Number.isInteger(requestedPageSize) && requestedPageSize > 0 &&
    pageSizeOptions.includes(requestedPageSize)
    ? requestedPageSize
    : defaultPageSize;
  const pageIndex = Number.isInteger(state.pageIndex) && (state.pageIndex ?? 0) >= 0
    ? state.pageIndex ?? 0
    : 0;
  return { pageIndex, pageSize };
}

export function paginateRows<T>(
  rows: readonly T[],
  state: Partial<PaginationState> = {},
  pageSizeOptions: readonly number[] = PAGE_SIZE_OPTIONS,
): PaginatedRows<T> {
  const normalized = normalizePagination(state, pageSizeOptions);
  const pageCount = Math.ceil(rows.length / normalized.pageSize);
  const pageIndex = pageCount === 0 ? 0 : Math.min(normalized.pageIndex, pageCount - 1);
  const start = pageIndex * normalized.pageSize;
  return {
    ...normalized,
    pageIndex,
    rows: rows.slice(start, start + normalized.pageSize),
    totalRows: rows.length,
    pageCount,
  };
}

export interface TableColumnDefinition {
  readonly id: string;
  readonly kind: "identifier" | "metric" | "units" | "other";
}

export interface VisibilityConstraints {
  readonly identifierColumnId?: string;
  readonly metricColumnIds?: readonly string[];
  readonly unitsColumnId?: string;
  readonly groupedQuery?: boolean;
  readonly forecast?: boolean;
}

export type ColumnVisibility = Readonly<Record<string, boolean>>;

/** Enforces safety invariants over a copied visibility state. */
export function enforceColumnVisibility(
  columns: readonly TableColumnDefinition[],
  requested: Readonly<Record<string, boolean>> = {},
  constraints: VisibilityConstraints = {},
): ColumnVisibility {
  const visibility: Record<string, boolean> = {};
  for (const column of columns) visibility[column.id] = requested[column.id] !== false;

  const identifier = constraints.identifierColumnId ?? columns.find((column) => column.kind === "identifier")?.id;
  if (identifier !== undefined) visibility[identifier] = true;

  const metricIds = constraints.metricColumnIds ?? columns
    .filter((column) => column.kind === "metric")
    .map((column) => column.id);
  if (constraints.groupedQuery === true && metricIds.length > 0 && !metricIds.some((id) => visibility[id] !== false)) {
    visibility[metricIds[0] as string] = true;
  }

  if (constraints.forecast === true) {
    const units = constraints.unitsColumnId ?? columns.find((column) => column.kind === "units")?.id ??
      columns.find((column) => column.id.toLowerCase() === "units")?.id;
    if (units !== undefined) visibility[units] = true;
  }
  return visibility;
}

export const resolveColumnVisibility = enforceColumnVisibility;

export type AnalyticalIdentity = Readonly<Record<string, unknown>>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function analyticalIdentityKey(identity: AnalyticalIdentity): string {
  return JSON.stringify(stableValue(identity));
}

export function sameAnalyticalIdentity(
  previous: AnalyticalIdentity | null | undefined,
  next: AnalyticalIdentity | null | undefined,
): boolean {
  if (previous === null || previous === undefined || next === null || next === undefined) {
    return previous === next;
  }
  return analyticalIdentityKey(previous) === analyticalIdentityKey(next);
}

/** True when table-local sort/filter/page state should be reset. */
export function shouldResetTableState(
  previous: AnalyticalIdentity | null | undefined,
  next: AnalyticalIdentity | null | undefined,
): boolean {
  return !sameAnalyticalIdentity(previous, next);
}
