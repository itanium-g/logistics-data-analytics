// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "../src/client/features/table/DataTable.tsx";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

interface Row {
  readonly id: string;
  readonly label: string;
  readonly key: string;
  readonly score: number | null;
  readonly group: string;
}

const rows: readonly Row[] = [
  { id: "a", label: "Alpha", key: "alpha", score: 4, group: "North" },
  { id: "b", label: "Beta", key: "beta", score: null, group: "South" },
  { id: "c", label: "Gamma", key: "gamma", score: 12, group: "North" },
];

const columns: readonly DataTableColumn<Row>[] = [
  {
    id: "label",
    header: "Group",
    accessorFn: (row) => row.label,
    enableHiding: false,
    meta: { kind: "identifier", label: "Group" },
  },
  {
    id: "score",
    header: "Score",
    accessorFn: (row) => row.score ?? undefined,
    meta: { kind: "metric", numeric: true, label: "Score" },
  },
  {
    id: "group",
    header: "Region",
    accessorKey: "group",
    meta: { kind: "other", label: "Region" },
  },
];

let container: HTMLDivElement;
let root: Root;

function renderTable(data: readonly Row[] = rows): void {
  act(() => {
    root.render(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(row) => row.id}
        caption="Returned groups"
        features={{
          facets: [{ id: "group", label: "Region", getValue: (row) => row.group }],
          columnVisibility: true,
          visibilityConstraints: { identifierColumnId: "label", metricColumnIds: ["score"], groupedQuery: true },
        }}
      />,
    );
  });
}

function bodyLabels(): string[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")]
    .map((row) => row.querySelector("th")?.textContent?.trim() ?? "");
}

describe("DataTable", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("searches readable labels, sorts raw numerics, and keeps null last", () => {
    renderTable();
    const score = [...container.querySelectorAll<HTMLButtonElement>(".sort-button")]
      .find((button) => button.textContent?.includes("Score"));
    expect(score).toBeDefined();

    act(() => score?.click());
    expect(bodyLabels()).toEqual(["Alpha", "Gamma", "Beta"]);

    const search = container.querySelector<HTMLInputElement>("input[type=search]");
    expect(search).not.toBeNull();
    act(() => {
      if (search === null) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(search, "gamma");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(bodyLabels()).toEqual(["Gamma"]);
  });

  it("applies facet options locally and enforces mandatory visibility", () => {
    renderTable();
    const options = container.querySelector<HTMLDetailsElement>(".table-options");
    expect(options).not.toBeNull();
    const north = [...container.querySelectorAll<HTMLInputElement>(".facet-values input")]
      .find((input) => input.parentElement?.textContent?.includes("North"));
    expect(north).toBeDefined();
    act(() => north?.click());
    expect(bodyLabels()).toEqual(["Alpha", "Gamma"]);

    const groupColumn = [...container.querySelectorAll<HTMLInputElement>(".column-visibility input")]
      .find((input) => input.parentElement?.textContent?.includes("Group"));
    expect(groupColumn?.disabled).toBe(true);
  });

  it("uses a 25-row default and exposes bounded previous/next pagination", () => {
    const many = Array.from({ length: 26 }, (_, index) => ({
      id: String(index),
      label: `Group ${index}`,
      key: `group-${index}`,
      score: index,
      group: "North",
    }));
    renderTable(many);
    expect(container.querySelector(".table-page-controls")).not.toBeNull();
    expect(container.querySelector(".table-result-summary")?.textContent).toContain("of 26 matching returned groups");
    const next = [...container.querySelectorAll<HTMLButtonElement>(".table-page-controls button")]
      .find((button) => button.textContent?.includes("Next"));
    act(() => next?.click());
    expect(container.querySelector(".table-page-controls")?.textContent).toContain("Page 2 of 2");
  });
});
