import type { CellContext, SortingFn } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { describeMetricBasis, formatGroupLabel, formatMetricValue } from "../../domain/format.ts";
import { DIMENSION_LABELS } from "../../domain/chart.ts";
import type { MetricValue, QueryResponse, QueryRow } from "../../shared/contracts.ts";
import { downloadCsvRows, sanitizeCsvFilename, type CsvColumn } from "./table/csv.ts";
import { DataTable, type DataTableColumn } from "./table/DataTable.tsx";
import {
  addStableRowIds,
  compareMonthKeys,
  compareRawNumeric,
  type RowWithStableId,
} from "./table/table-model.ts";

interface ResultTableProps {
  readonly result: QueryResponse;
  readonly caption: string;
}

type QueryTableRow = RowWithStableId<QueryRow>;

function keyHeading(result: QueryResponse): string {
  if (result.plan.breakdown !== null) return DIMENSION_LABELS[result.plan.breakdown];
  if (result.plan.time_grain !== "none") return "Month";
  return "Scope";
}

function metricFor(row: QueryRow, metricId: string): MetricValue | undefined {
  return row.metrics.find((metric) => metric.metric === metricId);
}

function metricFromResult(result: QueryResponse, metricId: string): MetricValue | undefined {
  return result.rows[0]?.metrics.find((metric) => metric.metric === metricId)
    ?? result.summary.find((metric) => metric.metric === metricId);
}

const numericSorting: SortingFn<QueryTableRow> = (left, right, columnId) =>
  compareRawNumeric(
    left.getValue<number | undefined>(columnId),
    right.getValue<number | undefined>(columnId),
    "asc",
  );

const monthSorting: SortingFn<QueryTableRow> = (left, right, columnId) =>
  compareMonthKeys(
    left.getValue<string | undefined>(columnId),
    right.getValue<string | undefined>(columnId),
    "asc",
  );

function renderMetricCell(context: CellContext<QueryTableRow, unknown>): ReactNode {
  const metric = metricFor(context.row.original, context.column.id);
  if (metric === undefined) return "N/A";
  const basis = describeMetricBasis(metric);
  return (
    <>
      <span>{formatMetricValue(metric)}</span>
      {basis !== "" && <span className="cell-basis">{basis}</span>}
    </>
  );
}

function queryExportColumns(result: QueryResponse, rows: readonly QueryTableRow[]): readonly CsvColumn<QueryTableRow>[] {
  const metricIds = result.plan.metrics;
  return [
    {
      columnId: "group",
      header: `${keyHeading(result)} [key]`,
      value: (row) => row.canonicalKey ?? row.key ?? "scope",
    },
    {
      columnId: "records",
      header: "Records [rows]",
      value: (row) => row.row_count,
    },
    ...metricIds.flatMap((metricId) => {
      const metric = metricFromResult(result, metricId);
      const label = metric?.label ?? metricId;
      const unit = metric?.unit ?? result.units[metricId] ?? "value";
      return [
        {
          columnId: metricId,
          header: `${label} [${unit}]`,
          value: (row: QueryTableRow) => metricFor(row, metricId)?.value ?? null,
        },
        {
          columnId: metricId,
          header: `${label} basis`,
          value: (row: QueryTableRow) => {
            const rowMetric = metricFor(row, metricId);
            return rowMetric === undefined ? "" : describeMetricBasis(rowMetric);
          },
        },
      ] satisfies readonly CsvColumn<QueryTableRow>[];
    }),
  ];
}

function queryIdentity(result: QueryResponse) {
  return {
    kind: "query",
    data_version: result.data_version,
    metric_version: result.metric_version,
    plan: result.plan,
    scope: result.scope,
  };
}

function ScalarResultTable({ result, caption }: ResultTableProps) {
  const rows = addStableRowIds(result.rows);
  const exportRows = rows.slice();
  const columns = queryExportColumns(result, rows);
  const exportContext = {
    result_kind: "query",
    analytical_identity: queryIdentity(result),
    scope_row_count: result.scope_row_count,
    returned_groups: result.returned_groups,
    total_groups: result.total_groups,
    truncated: result.truncated,
  };

  return (
    <div className="scalar-table-shell">
      <div className="table-toolbar table-toolbar-simple">
        <span className="table-export-note">CSV is a returned-data extract, not a complete evidence report.</span>
        <button
          type="button"
          className="secondary-button table-export"
          disabled={exportRows.length === 0}
          onClick={() => downloadCsvRows(exportRows, sanitizeCsvFilename(`Spaceship query ${result.data_version}`), { columns, exportContext })}
        >
          Export CSV
        </button>
      </div>
      <div className="table-region" tabIndex={0} aria-label={`${caption} scroll region`}>
        <table className="data-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{keyHeading(result)}</th>
              <th scope="col">Records</th>
              {result.plan.metrics.map((metricId) => <th key={metricId} scope="col">{metricFromResult(result, metricId)?.label ?? metricId}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={result.plan.metrics.length + 2}>No analytical rows were returned for this scope.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.rowId}>
                <th scope="row">{formatGroupLabel(row.key, result.plan.time_grain)}</th>
                <td className="numeric">{row.row_count}</td>
                {result.plan.metrics.map((metricId) => {
                  const metric = metricFor(row, metricId);
                  return <td className="numeric" key={metricId}>{metric === undefined ? "N/A" : formatMetricValue(metric)}</td>;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Whole scope · Entire analytical scope — unaffected by table filters</th>
              <td className="numeric">{result.scope_row_count}</td>
              {result.plan.metrics.map((metricId) => <td className="numeric" key={metricId}>{metricFromResult(result, metricId) === undefined ? "N/A" : formatMetricValue(metricFromResult(result, metricId) as MetricValue)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Query-response adapter. Scalar plans stay simple; grouped/temporal plans use TanStack. */
export function ResultTable({ result, caption }: ResultTableProps) {
  if (result.plan.breakdown === null && result.plan.time_grain === "none") {
    return <ScalarResultTable result={result} caption={caption} />;
  }

  const rows = addStableRowIds(result.rows);
  const columns: readonly DataTableColumn<QueryTableRow>[] = [
    {
      id: "group",
      header: keyHeading(result),
      accessorFn: (row) => row.canonicalKey ?? row.key ?? "scope",
      cell: ({ row }) => formatGroupLabel(row.original.key, result.plan.time_grain),
      enableHiding: false,
      sortingFn: result.plan.time_grain === "month" ? monthSorting : "alphanumeric",
      meta: {
        kind: "identifier",
        label: keyHeading(result),
        exportHeader: `${keyHeading(result)} [key]`,
        exportValue: (row) => row.canonicalKey ?? row.key ?? "scope",
      },
    },
    {
      id: "records",
      header: "Records",
      accessorKey: "row_count",
      sortingFn: numericSorting,
      meta: { kind: "other", numeric: true, label: "Records", exportHeader: "Records [rows]", exportValue: (row) => row.row_count },
    },
    ...result.plan.metrics.map((metricId): DataTableColumn<QueryTableRow> => {
      const metric = metricFromResult(result, metricId);
      return {
        id: metricId,
        header: metric?.label ?? metricId,
        accessorFn: (row) => metricFor(row, metricId)?.value ?? undefined,
        sortingFn: numericSorting,
        cell: renderMetricCell,
        meta: {
          kind: "metric",
          numeric: true,
          label: metric?.label ?? metricId,
          exportHeader: `${metric?.label ?? metricId} [${metric?.unit ?? result.units[metricId] ?? "value"}]`,
          exportValue: (row) => metricFor(row, metricId)?.value ?? null,
        },
      };
    }),
  ];

  return (
    <>
      <p className="table-export-note">CSV is a returned-data extract, not a complete evidence report.</p>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.rowId}
        caption={caption}
        features={{
          search: true,
          facets: result.plan.breakdown === null ? undefined : [{
            id: "group",
            label: `${keyHeading(result)} groups`,
            getValue: (row) => row.canonicalKey ?? row.key ?? row.readableLabel,
          }],
          columnVisibility: true,
          visibilityConstraints: {
            identifierColumnId: "group",
            metricColumnIds: result.plan.metrics,
            groupedQuery: true,
          },
          export: {
            filename: `Spaceship query ${result.data_version}`,
            columns: queryExportColumns(result, rows),
            context: {
              result_kind: "query",
              analytical_identity: queryIdentity(result),
              scope_row_count: result.scope_row_count,
              returned_groups: result.returned_groups,
              total_groups: result.total_groups,
              truncated: result.truncated,
            },
          },
          identity: queryIdentity(result),
        }}
        renderFooter={(table) => (
          <tr>
            <th scope="row">Whole scope · Entire analytical scope — unaffected by table filters</th>
            {table.getVisibleLeafColumns().slice(1).map((column) => {
              if (column.id === "records") return <td className="numeric" key={column.id}>{result.scope_row_count}</td>;
              const summary = result.summary.find((metric) => metric.metric === column.id);
              return <td className="numeric" key={column.id}>{summary === undefined ? "N/A" : formatMetricValue(summary)}</td>;
            })}
          </tr>
        )}
      />
    </>
  );
}
