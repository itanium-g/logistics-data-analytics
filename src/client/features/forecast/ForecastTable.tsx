import type { SortingFn } from "@tanstack/react-table";
import { formatMonthKey } from "../../../domain/format.ts";
import type { ForecastPoint, ForecastResponse } from "../../../shared/contracts.ts";
import type { CsvColumn } from "../table/csv.ts";
import { DataTable, type DataTableColumn } from "../table/DataTable.tsx";
import { addStableRowIds, compareMonthKeys, compareRawNumeric, type RowWithStableId } from "../table/table-model.ts";

interface ForecastTableProps {
  readonly result: ForecastResponse;
}

interface ForecastTableBase extends ForecastPoint {
  readonly id: string;
  readonly key: string;
  readonly label: string;
}

type ForecastTableRow = RowWithStableId<ForecastTableBase>;

const monthSorting: SortingFn<ForecastTableRow> = (left, right, columnId) =>
  compareMonthKeys(left.getValue<string | undefined>(columnId), right.getValue<string | undefined>(columnId), "asc");

const numericSorting: SortingFn<ForecastTableRow> = (left, right, columnId) =>
  compareRawNumeric(left.getValue<number | undefined>(columnId), right.getValue<number | undefined>(columnId), "asc");

function forecastRows(result: ForecastResponse): readonly ForecastTableRow[] {
  const rows: readonly ForecastTableBase[] = [...result.history, ...result.forecast].map((point) => ({
    ...point,
    id: `${point.kind}-${point.month}`,
    key: point.month,
    label: formatMonthKey(point.month),
  }));
  return addStableRowIds(rows);
}

function forecastIdentity(result: ForecastResponse) {
  return {
    kind: "forecast",
    sku: result.sku,
    horizon_months: result.horizon_months,
    buffer_pct: result.buffer_pct,
    as_of_date: result.as_of_date,
    history_range: result.history_range,
    data_version: result.data_version,
    metric_version: result.metric_version,
  };
}

function forecastExportColumns(): readonly CsvColumn<ForecastTableRow>[] {
  return [
    { columnId: "month", header: "Month [YYYY-MM]", value: (row) => row.month },
    { columnId: "basis", header: "Basis", value: (row) => row.kind === "history" ? "Recorded" : "Forecast" },
    { columnId: "units", header: "Units [units]", value: (row) => row.units },
  ];
}

/** Forecast-point adapter for the shared response-row table. */
export function ForecastTable({ result }: ForecastTableProps) {
  const rows = forecastRows(result);
  const columns: readonly DataTableColumn<ForecastTableRow>[] = [
    {
      id: "month",
      header: "Month",
      accessorKey: "month",
      sortingFn: monthSorting,
      enableHiding: false,
      meta: { kind: "identifier", label: "Month", exportHeader: "Month [YYYY-MM]", exportValue: (row) => row.month },
      cell: ({ row }) => row.original.label,
    },
    {
      id: "basis",
      header: "Basis",
      accessorFn: (row) => row.kind === "history" ? "Recorded" : "Forecast",
      meta: { kind: "other", label: "Basis", exportValue: (row) => row.kind === "history" ? "Recorded" : "Forecast" },
    },
    {
      id: "units",
      header: "Units",
      accessorKey: "units",
      sortingFn: numericSorting,
      enableHiding: false,
      meta: { kind: "units", numeric: true, label: "Units", exportHeader: "Units [units]", exportValue: (row) => row.units },
      cell: ({ row }) => row.original.units,
    },
  ];

  return (
    <div className="forecast-table-adapter">
      <p className="table-export-note">CSV is a returned-data extract; forecast units export the unrounded response values.</p>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.rowId}
        caption={`Recorded and forecast monthly units for ${result.sku}. Forecast months show the baseline before rounding.`}
        features={{
          search: true,
          facets: [{ id: "basis", label: "Basis", getValue: (row) => row.kind === "history" ? "Recorded" : "Forecast" }],
          columnVisibility: true,
          visibilityConstraints: { identifierColumnId: "month", unitsColumnId: "units", forecast: true },
          export: {
            filename: `Spaceship forecast ${result.sku} ${result.data_version}`,
            columns: forecastExportColumns(),
            context: {
              result_kind: "forecast",
              analytical_identity: forecastIdentity(result),
              history_count: result.history.length,
              forecast_count: result.forecast.length,
            },
          },
          identity: forecastIdentity(result),
        }}
      />
    </div>
  );
}
