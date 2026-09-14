/** Pure CSV serialization plus a small browser-only download adapter. */

export type CsvCell = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  readonly id?: string;
  /** Optional owning table column, used to respect DataTable visibility. */
  readonly columnId?: string;
  readonly header: string;
  readonly visible?: boolean;
  readonly value?: (row: T) => CsvCell;
  readonly getValue?: (row: T) => CsvCell;
}

export interface CsvSerializeOptions<T> {
  readonly columns: readonly CsvColumn<T>[];
  readonly delimiter?: string;
  readonly includeHeader?: boolean;
  readonly exportContext?: unknown;
  readonly exportContextHeader?: string;
}

const UTF8_BOM = "\uFEFF";

function guardFormulaString(value: string): string {
  const leadingWhitespace = value.match(/^\s*/u)?.[0] ?? "";
  const firstNonWhitespace = value.slice(leadingWhitespace.length);
  return /^[=+\-@]/u.test(firstNonWhitespace)
    ? `${leadingWhitespace}'${firstNonWhitespace}`
    : value;
}

function cellText(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "string" ? guardFormulaString(cell) : String(cell);
}

function escapeCsvCell(cell: CsvCell, delimiter: string): string {
  const value = cellText(cell);
  if (value.includes(delimiter) || value.includes('"') || value.includes("\r") || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function columnValue<T>(column: CsvColumn<T>, row: T): CsvCell {
  if (column.value !== undefined) return column.value(row);
  if (column.getValue !== undefined) return column.getValue(row);
  if (column.id === undefined || typeof row !== "object" || row === null) return "";
  return (row as Record<string, unknown>)[column.id] as CsvCell;
}

/** Serializes visible columns with UTF-8 BOM and CRLF row separators. */
export function serializeCsv<T>(rows: readonly T[], options: CsvSerializeOptions<T>): string {
  const delimiter = options.delimiter ?? ",";
  if (delimiter.length === 0 || delimiter.includes("\r") || delimiter.includes("\n")) {
    throw new Error("CSV delimiter must be a non-empty, single-line string");
  }
  const columns = options.columns.filter((column) => column.visible !== false);
  const exportContextColumn = options.exportContext === undefined
    ? []
    : [{
        header: options.exportContextHeader ?? "export_context",
        value: () => {
          const json = JSON.stringify(options.exportContext);
          return json === undefined ? "" : json;
        },
      } satisfies CsvColumn<T>];
  const allColumns = [...columns, ...exportContextColumn];
  const output: string[] = [];
  if (options.includeHeader !== false) {
    output.push(allColumns.map((column) => escapeCsvCell(column.header, delimiter)).join(delimiter));
  }
  for (const row of rows) {
    output.push(allColumns.map((column) => escapeCsvCell(columnValue(column, row), delimiter)).join(delimiter));
  }
  return UTF8_BOM + output.join("\r\n");
}

export const toCsv = serializeCsv;

/** Converts a user-facing title into a stable, safe .csv filename. */
export function sanitizeCsvFilename(input: string, fallback = "spaceship-logistics-export"): string {
  const source = input.normalize("NFKC").trim();
  const safe = source
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^\.+|\.+$/gu, "")
    .replace(/-+$/u, "");
  const base = safe === "" ? fallback : safe;
  return /\.csv$/iu.test(base) ? base : `${base}.csv`;
}

export const makeCsvFilename = sanitizeCsvFilename;

export interface DownloadAnchor {
  href: string;
  download: string;
  readonly click: () => void;
  readonly remove?: () => void;
}

export interface CsvBlob {
  readonly size?: number;
  readonly type?: string;
}

export interface CsvBlobConstructor {
  new (parts: readonly unknown[], options?: { readonly type?: string }): CsvBlob;
}

export interface CsvUrlApi {
  readonly createObjectURL: (blob: CsvBlob) => string;
  readonly revokeObjectURL: (url: string) => void;
}

export interface CsvDownloadDocument {
  readonly body?: {
    readonly appendChild: (anchor: DownloadAnchor) => unknown;
    readonly removeChild?: (anchor: DownloadAnchor) => unknown;
  } | null;
  readonly createElement: (tagName: "a") => DownloadAnchor;
}

export interface CsvDownloadEnvironment {
  readonly Blob: CsvBlobConstructor;
  readonly URL: CsvUrlApi;
  readonly document: CsvDownloadDocument;
}

function browserDownloadEnvironment(): CsvDownloadEnvironment {
  const globals = globalThis as unknown as {
    readonly Blob?: CsvBlobConstructor;
    readonly URL?: CsvUrlApi;
    readonly document?: CsvDownloadDocument;
  };
  if (globals.Blob === undefined || globals.URL === undefined || globals.document === undefined) {
    throw new Error("CSV downloads require a browser environment");
  }
  return { Blob: globals.Blob, URL: globals.URL, document: globals.document };
}

/** Downloads serialized CSV and revokes/removes temporary browser resources. */
export function downloadCsv(
  csv: string,
  filename: string,
  environment: CsvDownloadEnvironment = browserDownloadEnvironment(),
): void {
  const blob = new environment.Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = environment.URL.createObjectURL(blob);
  let anchor: DownloadAnchor | undefined;
  let appended = false;
  try {
    anchor = environment.document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = sanitizeCsvFilename(filename);
    if (environment.document.body !== null && environment.document.body !== undefined) {
      environment.document.body.appendChild(anchor);
      appended = true;
    }
    anchor.click();
  } finally {
    if (anchor !== undefined && appended) {
      if (anchor.remove !== undefined) anchor.remove();
      else environment.document.body?.removeChild?.(anchor);
    }
    environment.URL.revokeObjectURL(objectUrl);
  }
}

export function downloadCsvRows<T>(
  rows: readonly T[],
  filename: string,
  options: CsvSerializeOptions<T>,
  environment?: CsvDownloadEnvironment,
): void {
  downloadCsv(serializeCsv(rows, options), filename, environment);
}
