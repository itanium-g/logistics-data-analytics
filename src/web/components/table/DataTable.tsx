import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type SortingState,
  type Table,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  analyticalIdentityKey,
  matchesTableSearch,
  stableResponseRowId,
  enforceColumnVisibility,
  type AnalyticalIdentity,
  type TableColumnDefinition,
  type VisibilityConstraints,
} from "./table-model.ts";
import {
  downloadCsvRows,
  sanitizeCsvFilename,
  type CsvCell,
  type CsvColumn,
} from "./csv.ts";

export interface DataTableColumnMeta<T> {
  readonly kind?: "identifier" | "metric" | "units" | "other";
  readonly numeric?: boolean;
  readonly label?: string;
  readonly exportHeader?: string;
  readonly exportValue?: (row: T) => CsvCell;
}

export type DataTableColumn<T> = ColumnDef<T, unknown> & {
  readonly id?: string;
  readonly meta?: DataTableColumnMeta<T>;
};

export interface TableFacet<T> {
  readonly id: string;
  readonly label: string;
  readonly getValue: (row: T) => string | readonly string[] | null | undefined;
}

export interface DataTableExportConfig<T> {
  readonly filename: string;
  readonly columns?: readonly CsvColumn<T>[];
  readonly context: unknown;
}

export interface DataTableFeatures<T> {
  readonly search?: boolean;
  readonly facets?: readonly TableFacet<T>[];
  readonly columnVisibility?: boolean;
  readonly export?: DataTableExportConfig<T>;
  readonly pageSizes?: readonly number[];
  readonly identity?: AnalyticalIdentity;
  readonly visibilityConstraints?: VisibilityConstraints;
}

export interface DataTableProps<T> {
  readonly data: readonly T[];
  readonly columns: readonly DataTableColumn<T>[];
  readonly getRowId?: (row: T, index: number) => string;
  readonly caption: string;
  readonly features?: DataTableFeatures<T>;
  readonly renderFooter?: (table: Table<T>) => ReactNode;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function facetFilter<T>(
  facet: TableFacet<T> | undefined,
): FilterFn<T> {
  return (row, _columnId, value) => {
    const selections = asStringArray(value);
    if (selections.length === 0 || facet === undefined) return true;
    const raw = facet.getValue(row.original);
    const values = typeof raw === "string" ? [raw] : (raw ?? []);
    return values.some((entry) => selections.includes(entry));
  };
}

function defaultHeader<T>(column: DataTableColumn<T>): string {
  if (column.meta?.label !== undefined) return column.meta.label;
  if (typeof column.header === "string") return column.header;
  return column.id ?? "Value";
}

function defaultExportColumns<T>(
  columns: readonly DataTableColumn<T>[],
  table: ReturnType<typeof useReactTable<T>>,
): readonly CsvColumn<T>[] {
  return table.getVisibleLeafColumns().map((column) => {
    const definition = columns.find((candidate) => (candidate.id ?? "") === column.id);
    const exportValue = definition?.meta?.exportValue;
    return {
      id: column.id,
      columnId: column.id,
      header: definition?.meta?.exportHeader ?? defaultHeader(definition ?? column.columnDef as DataTableColumn<T>),
      value: exportValue ?? ((row: T) => {
        const accessor = "accessorFn" in column.columnDef && typeof column.columnDef.accessorFn === "function"
          ? column.columnDef.accessorFn
          : undefined;
        if (accessor !== undefined) return accessor(row, 0) as CsvCell;
        if (column.id in Object(row)) return (row as Record<string, unknown>)[column.id] as CsvCell;
        return "";
      }),
    } satisfies CsvColumn<T>;
  });
}

function sortLabel(direction: false | "asc" | "desc"): "ascending" | "descending" | "none" {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

function facetEntries<T>(table: ReturnType<typeof useReactTable<T>>, facet: TableFacet<T>): readonly [string, number][] {
  const column = table.getColumn(facet.id);
  if (column === undefined) return [];
  return [...column.getFacetedUniqueValues().entries()]
    .filter(([value]) => typeof value === "string")
    .map(([value, count]) => [String(value), count] as [string, number])
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * Generic native table presentation. It only models rows already returned by
 * an API adapter; all search, facets, sorting, visibility, pagination, and
 * export operations are local to this instance.
 */
export function DataTable<T>({ data, columns, getRowId, caption, features = {}, renderFooter }: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const pageSizes = features.pageSizes ?? PAGE_SIZE_OPTIONS;
  const identityKey = useMemo(
    () => analyticalIdentityKey(features.identity ?? {}),
    [features.identity],
  );
  const previousIdentityKey = useRef(identityKey);
  const sourceData = useMemo(() => data.slice(), [data]);
  const facetById = useMemo(
    () => new Map((features.facets ?? []).map((facet) => [facet.id, facet])),
    [features.facets],
  );
  const tableColumns = useMemo(
    () =>
      columns.map((column) => {
        const id = column.id ?? "";
        const facet = facetById.get(id);
        const meta = column.meta;
        const base = {
          ...column,
          sortUndefined: "last" as const,
          enableHiding: meta?.kind !== "identifier" && meta?.kind !== "units",
        };
        return facet === undefined ? base : { ...base, filterFn: facetFilter(facet) };
      }),
    [columns, facetById],
  );

  const table = useReactTable({
    data: sourceData,
    columns: tableColumns,
    state: { globalFilter, columnFilters, sorting, pagination, columnVisibility },
    getRowId: getRowId ?? ((row, index) => stableResponseRowId(row as unknown as { key?: unknown; label?: unknown }, index)),
    onGlobalFilterChange: (updater) => {
      const next = typeof updater === "function" ? updater(globalFilter) : updater;
      setGlobalFilter(next ?? "");
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnFilters) : updater;
      setColumnFilters(next);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: (updater) => {
      const requested = typeof updater === "function" ? updater(columnVisibility) : updater;
      const definitions: TableColumnDefinition[] = columns.map((column) => ({
        id: column.id ?? "",
        kind: column.meta?.kind ?? "other",
      }));
      const next = enforceColumnVisibility(definitions, requested, features.visibilityConstraints);
      setColumnVisibility(next);
      setSorting((current) => current.filter((entry) => next[entry.id] !== false));
    },
    globalFilterFn: (_row, _columnId, filterValue) => matchesTableSearch(_row.original, String(filterValue ?? "")),
    enableMultiSort: false,
    enableSortingRemoval: true,
    sortDescFirst: false,
    isMultiSortEvent: () => false,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const pageRows = table.getPaginationRowModel().rows;
  const pageCount = table.getPageCount();
  const currentPageIndex = table.getState().pagination.pageIndex;
  const tableHasControls =
    globalFilter.trim() !== "" || columnFilters.length > 0 || sorting.length > 0 ||
    Object.values(columnVisibility).some((visible) => !visible) || currentPageIndex > 0 ||
    table.getState().pagination.pageSize !== DEFAULT_PAGE_SIZE;

  useEffect(() => {
    if (identityKey === previousIdentityKey.current) return;
    previousIdentityKey.current = identityKey;
    setGlobalFilter("");
    setColumnFilters([]);
    setSorting([]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
    setColumnVisibility({});
  }, [identityKey]);

  useEffect(() => {
    if (pageCount === 0 && currentPageIndex !== 0) {
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    } else if (pageCount > 0 && currentPageIndex >= pageCount) {
      setPagination((current) => ({ ...current, pageIndex: pageCount - 1 }));
    }
  }, [currentPageIndex, pageCount]);

  const resetTableView = (): void => {
    setGlobalFilter("");
    setColumnFilters([]);
    setSorting([]);
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
    setColumnVisibility({});
  };

  const toggleFacet = (facet: TableFacet<T>, value: string): void => {
    const column = table.getColumn(facet.id);
    if (column === undefined) return;
    const selected = asStringArray(column.getFilterValue());
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    column.setFilterValue(next.length === 0 ? undefined : next);
  };

  const exportRows = table.getPrePaginationRowModel().rows.map((row) => row.original);
  const exportConfig = features.export;
  const exportDisabled = exportRows.length === 0 || exportConfig === undefined;

  const exportTable = (): void => {
    if (exportConfig === undefined || exportRows.length === 0) return;
    const visibleColumnIds = new Set(table.getVisibleLeafColumns().map((column) => column.id));
    const exportColumns = (exportConfig.columns ?? defaultExportColumns(columns, table)).filter(
      (column) => column.columnId === undefined || visibleColumnIds.has(column.columnId),
    );
    const filename = sanitizeCsvFilename(exportConfig.filename);
    const tableView = {
      search: globalFilter,
      facets: Object.fromEntries(columnFilters.map((filter) => [filter.id, filter.value])),
      sorting,
      column_visibility: columnVisibility,
      page_index: currentPageIndex,
      page_size: table.getState().pagination.pageSize,
    };
    const exportContext =
      typeof exportConfig.context === "object" && exportConfig.context !== null
        ? { ...(exportConfig.context as Record<string, unknown>), table_view: tableView }
        : { context: exportConfig.context, table_view: tableView };
    downloadCsvRows(exportRows, filename, {
      columns: exportColumns,
      exportContext,
    });
  };

  return (
    <section className="data-table-shell" aria-label={caption}>
      <div className="table-toolbar">
        <div className="table-toolbar-primary">
          {features.search !== false && (
            <label className="table-search">
              <span>Search returned data</span>
              <input
                type="search"
                name="table-search"
                value={globalFilter}
                placeholder="Search labels or keys"
                onChange={(event) => setGlobalFilter(event.target.value)}
              />
            </label>
          )}
          {exportConfig !== undefined && (
            <button type="button" className="secondary-button table-export" onClick={exportTable} disabled={exportDisabled}>
              Export CSV
            </button>
          )}
        </div>
        {tableHasControls && (
          <button type="button" className="link-button" onClick={resetTableView}>Reset table view</button>
        )}
      </div>

      {(features.facets !== undefined && features.facets.length > 0 || features.columnVisibility) && (
        <details className="table-options">
          <summary>Table options</summary>
          <div className="table-options-content">
            {features.facets !== undefined && features.facets.length > 0 && (
              <div className="table-facets">
                <h4>Filter returned rows</h4>
                <div className="facet-grid">
                  {features.facets.map((facet) => (
                    <fieldset className="facet" key={facet.id}>
                      <legend>{facet.label}</legend>
                      <div className="facet-values">
                        {facetEntries(table, facet).map(([value, count]) => {
                          const selected = asStringArray(table.getColumn(facet.id)?.getFilterValue());
                          return (
                            <label key={value}>
                    <input
                      type="checkbox"
                      name={`facet-${facet.id}-${value}`}
                      checked={selected.includes(value)}
                                onChange={() => toggleFacet(facet, value)}
                              />
                              <span>{value}</span>
                              <span className="facet-count">{count}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
            )}

            {features.columnVisibility && (
              <fieldset className="column-visibility">
                <legend>Columns</legend>
                <div className="column-visibility-grid">
                  {table.getAllLeafColumns().map((column) => (
                    <label key={column.id}>
                  <input
                    type="checkbox"
                    name={`column-${column.id}`}
                    checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                        disabled={!column.getCanHide()}
                      />
                      <span>{defaultHeader(column.columnDef as DataTableColumn<T>)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </details>
      )}

      <div className="table-result-summary" role="status" aria-live="polite">
        {data.length === 0 ? (
          <span>No analytical rows were returned for this scope.</span>
        ) : filteredRows.length === 0 ? (
          <span>No returned rows match these table controls.</span>
        ) : (
          <span>
            Showing {currentPageIndex * table.getState().pagination.pageSize + 1}–{Math.min((currentPageIndex + 1) * table.getState().pagination.pageSize, filteredRows.length)} of {filteredRows.length} matching returned {filteredRows.length === 1 ? "group" : "groups"}.
          </span>
        )}
      </div>

      <div className="table-region" tabIndex={0} aria-label={`${caption} scroll region`}>
        <table className="data-table">
          <caption>{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === false ? undefined : sortLabel(sorted)}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="sort-button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${defaultHeader(header.column.columnDef as DataTableColumn<T>)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="sort-indicator" aria-hidden="true">{sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}</span>
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length}>
                  {data.length === 0 ? "No analytical rows were returned for this scope." : "No returned rows match these table controls."}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    (() => {
                      const meta = cell.column.columnDef.meta as DataTableColumnMeta<T> | undefined;
                      const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                      return meta?.kind === "identifier" ? (
                        <th key={cell.id} scope="row">{content}</th>
                      ) : (
                        <td key={cell.id} className={meta?.numeric || meta?.kind === "metric" || meta?.kind === "units" ? "numeric" : undefined}>
                          {content}
                        </td>
                      );
                    })()
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {renderFooter !== undefined && <tfoot>{renderFooter(table)}</tfoot>}
        </table>
      </div>

      <div className="table-pagination">
        <label>
          <span>Rows per page</span>
              <select
                name="table-page-size"
                value={table.getState().pagination.pageSize}
            onChange={(event) => {
              setPagination({ pageIndex: 0, pageSize: Number(event.target.value) });
            }}
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        {pageCount > 1 && (
          <div className="table-page-controls">
            <button type="button" className="secondary-button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button>
            <span>Page {currentPageIndex + 1} of {pageCount}</span>
            <button type="button" className="secondary-button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
          </div>
        )}
      </div>
    </section>
  );
}
