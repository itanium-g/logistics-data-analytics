import { describe, expect, it, vi } from "vitest";
import {
  downloadCsv,
  sanitizeCsvFilename,
  serializeCsv,
  type CsvDownloadEnvironment,
} from "../src/web/components/table/csv.ts";

describe("table CSV export", () => {
  it("serializes raw values, escaping CSV syntax and guarding string formulas", () => {
    const csv = serializeCsv([
      {
        label: "Dock, A",
        quote: 'said "ready"',
        note: "line one\r\nline two",
        unicode: "München 🚚",
        formula: "  =SUM(A1:A2)",
        numericFormula: -1,
        emptyNumber: null,
        fraction: 0.8468,
        cents: 12345,
        days: 3.25,
        forecastUnits: 12.3456,
      },
    ], {
      columns: [
        { id: "label", header: "Label" },
        { id: "quote", header: "Quote" },
        { id: "note", header: "Note" },
        { id: "unicode", header: "Unicode" },
        { id: "formula", header: "Formula" },
        { id: "numericFormula", header: "Number" },
        { id: "emptyNumber", header: "Missing numeric" },
        { id: "fraction", header: "Raw fraction" },
        { id: "cents", header: "Raw cents" },
        { id: "days", header: "Raw days" },
        { id: "forecastUnits", header: "Unrounded units" },
        { id: "hidden", header: "Hidden", visible: false, value: () => "omit" },
      ],
      exportContext: { basis: "dataset", date_context: "current" },
    });

    expect(csv.startsWith("\uFEFFLabel,Quote,Note")).toBe(true);
    expect(csv).toContain('"Dock, A"');
    expect(csv).toContain('"said ""ready"""');
    expect(csv).toContain('"line one\r\nline two"');
    expect(csv).toContain("München 🚚");
    expect(csv).toContain("  '=SUM(A1:A2)");
    expect(csv).toContain(',-1,,0.8468,12345,3.25,12.3456,"{""basis"":""dataset"",""date_context"":""current""}"');
    expect(csv).not.toContain("Hidden");
    expect(csv).toMatch(/\r\n/u);
  });

  it("supports alternate delimiters and deterministic safe filenames", () => {
    expect(serializeCsv([{ value: "a;b" }], {
      delimiter: ";",
      columns: [{ id: "value", header: "Value" }],
    })).toContain('"a;b"');
    expect(sanitizeCsvFilename(" Spaceship: Logistics/Forecast ?.csv ")).toBe(
      "Spaceship-Logistics-Forecast-.csv",
    );
    expect(sanitizeCsvFilename("***")).toBe("spaceship-logistics-export.csv");
  });

  it("keeps a zero-row export valid with headers and final context column", () => {
    expect(serializeCsv([], {
      columns: [{ header: "Identifier", value: () => null }],
      exportContext: { query: "none" },
    })).toBe("\uFEFFIdentifier,export_context");
  });

  it("cleans up the temporary object URL and anchor after download", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => "blob:spaceship");
    const environment: CsvDownloadEnvironment = {
      Blob: Blob as unknown as CsvDownloadEnvironment["Blob"],
      URL: { createObjectURL, revokeObjectURL },
      document: {
        body: { appendChild },
        createElement: vi.fn(() => ({ href: "", download: "", click, remove })),
      },
    };

    downloadCsv("\uFEFFa\r\n1", "Unsafe:/forecast", environment);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:spaceship");
  });
});
