import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  addStableRowIds,
  compareMonthKeys,
  compareRawNumeric,
  enforceColumnVisibility,
  filterTableRows,
  normalizePagination,
  paginateRows,
  restoreServerOrder,
  sameAnalyticalIdentity,
  shouldResetTableState,
  sortRowsByMonth,
  sortRowsByNumeric,
  stableResponseRowId,
} from "../src/client/features/table/table-model.ts";

describe("table response model", () => {
  it("derives stable IDs and search fields without changing server rows", () => {
    const rows = [
      { key: "north", label: "North region", value: 2 },
      { key: "north", label: "North duplicate", value: 1 },
      { key: null, label: "Whole scope", value: 3 },
    ] as const;
    const withIds = addStableRowIds(rows);

    expect(withIds.map((row) => row.rowId)).toEqual([
      stableResponseRowId(rows[0]),
      stableResponseRowId(rows[1]) + ":1",
      stableResponseRowId(rows[2]),
    ]);
    expect(withIds[0]?.readableLabel).toBe("North region");
    expect(withIds[2]?.canonicalKey).toBeNull();
    expect(rows).toEqual([
      { key: "north", label: "North region", value: 2 },
      { key: "north", label: "North duplicate", value: 1 },
      { key: null, label: "Whole scope", value: 3 },
    ]);
  });

  it("sorts raw numbers with nulls last in both directions and stable ties", () => {
    const rows = [
      { id: "a", value: 2 },
      { id: "b", value: null },
      { id: "c", value: 1 },
      { id: "d", value: 2 },
      { id: "e", value: undefined },
    ] as const;

    expect(sortRowsByNumeric(rows, (row) => row.value, "asc").map((row) => row.id)).toEqual([
      "c", "a", "d", "b", "e",
    ]);
    expect(sortRowsByNumeric(rows, (row) => row.value, "desc").map((row) => row.id)).toEqual([
      "a", "d", "c", "b", "e",
    ]);
    expect(compareRawNumeric(null, 1, "desc")).toBeGreaterThan(0);
  });

  it("sorts YYYY-MM values chronologically and restores original order for ties", () => {
    const rows = [
      { id: "first", month: "2025-02" },
      { id: "second", month: "2024-12" },
      { id: "third", month: "2025-02" },
      { id: "missing", month: null },
    ] as const;
    expect(sortRowsByMonth(rows, (row) => row.month, "asc").map((row) => row.id)).toEqual([
      "second", "first", "third", "missing",
    ]);
    expect(sortRowsByMonth(rows, (row) => row.month, "desc").map((row) => row.id)).toEqual([
      "first", "third", "second", "missing",
    ]);
    expect(compareMonthKeys("2025-01", "2024-12")).toBeGreaterThan(0);
  });

  it("combines case-insensitive search with OR facets and AND across facets", () => {
    const rows = [
      { label: "North Hub", key: "NORTH", carrier: "GLS", status: "delivered" },
      { label: "South Hub", key: "south", carrier: "DHL", status: "delayed" },
      { label: "Central Depot", key: "central", carrier: "DHL", status: "delivered" },
    ] as const;
    expect(filterTableRows(rows, { search: "north" })).toHaveLength(1);
    expect(filterTableRows(rows, { search: "NORTH" })).toHaveLength(1);
    expect(filterTableRows(rows, { search: "south" })).toHaveLength(1);
    expect(filterTableRows(rows, {
      facets: { carrier: ["GLS", "DHL"], status: ["delivered"] },
    }).map((row) => row.key)).toEqual(["NORTH", "central"]);
    expect(filterTableRows(rows, {
      search: "hub",
      facets: { carrier: ["DHL"], status: ["delayed", "delivered"] },
    }).map((row) => row.key)).toEqual(["south"]);
  });

  it("uses bounded pagination defaults and does not mutate the source", () => {
    const rows = [1, 2, 3, 4, 5];
    expect(normalizePagination()).toEqual({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
    expect(paginateRows(rows, { pageIndex: 1, pageSize: 2 }, [2])).toEqual({
      rows: [3, 4], pageIndex: 1, pageSize: 2, totalRows: 5, pageCount: 3,
    });
    expect(paginateRows(rows, { pageIndex: 99, pageSize: 2 }, [2]).rows).toEqual([5]);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
    expect(restoreServerOrder(rows)).toEqual(rows);
    expect(restoreServerOrder(rows)).not.toBe(rows);
  });

  it("keeps identifiers, grouped metrics, and forecast units visible", () => {
    const columns = [
      { id: "label", kind: "identifier" },
      { id: "orders", kind: "metric" },
      { id: "days", kind: "metric" },
      { id: "units", kind: "units" },
      { id: "basis", kind: "other" },
    ] as const;
    const hidden = { label: false, orders: false, days: false, units: false, basis: false };
    expect(enforceColumnVisibility(columns, hidden, { groupedQuery: true, forecast: true })).toEqual({
      label: true, orders: true, days: false, units: true, basis: false,
    });
  });

  it("compares analytical identity independently of object key order", () => {
    const one = { metrics: ["orders"], breakdown: "region", filters: [{ field: "status", values: ["delivered"] }] };
    const same = { filters: [{ values: ["delivered"], field: "status" }], breakdown: "region", metrics: ["orders"] };
    const changed = { ...one, breakdown: "carrier" };
    expect(sameAnalyticalIdentity(one, same)).toBe(true);
    expect(shouldResetTableState(one, same)).toBe(false);
    expect(shouldResetTableState(one, changed)).toBe(true);
    expect(sameAnalyticalIdentity(one, null)).toBe(false);
    expect(sameAnalyticalIdentity(null, null)).toBe(true);
  });
});
