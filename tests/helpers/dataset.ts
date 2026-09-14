/**
 * Test fixtures backed by a real SQL engine.
 *
 * The supplied CSV is a user-provided input and is not committed, so fixture
 * dependent suites skip cleanly when it is absent. Pure-logic suites always run.
 *
 * Statements execute against Node's built-in node:sqlite through the same SqlDb
 * interface the Worker satisfies with D1, so tests exercise the real SQL rather
 * than a hand-written stub.
 */
import { parse } from "csv-parse/sync";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqlDb } from "../../src/shared/db.ts";
import {
  computeDatasetStats,
  validateHeader,
  validateRows,
  type DatasetStats,
  type OrderRow,
} from "../../src/data/import.ts";
import { buildSeedSql } from "../../src/data/seed-sql.ts";
import type { D1Database, D1PreparedStatement } from "../../src/server/env.ts";
import {
  ASSUMED_COVERAGE_END,
  ASSUMED_COVERAGE_START,
  DATASET_REFERENCE_DATE,
  DATA_VERSION,
  METRIC_VERSION,
  SUPPLIED_CSV_SHA256,
} from "../../src/shared/dataset.ts";

const ROOT = process.cwd();

export const SUPPLIED_CSV_PATH = path.join(
  ROOT,
  "docs",
  "assignment",
  "mock_logistics_data.csv",
);

export const MIGRATION_PATH = path.join(ROOT, "migrations", "0001_initial_schema.sql");

export const MANIFEST_PATH = path.join(ROOT, ".generated", "manifest.json");

/** False on a clean checkout that has not been given the user-supplied CSV. */
export const hasSuppliedCsv = existsSync(SUPPLIED_CSV_PATH);

export function readSuppliedRecords(): readonly Record<string, string>[] {
  const content = readFileSync(SUPPLIED_CSV_PATH);
  const table = parse(content, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as string[][];

  const header = table[0] ?? [];
  const headerIssues = validateHeader(header);
  if (headerIssues.length > 0) {
    throw new Error(`Supplied CSV header is unexpected: ${JSON.stringify(headerIssues)}`);
  }

  return table.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    return record;
  });
}

let cachedRows: readonly OrderRow[] | null = null;

/** Validated rows from the supplied CSV, parsed once per test process. */
export function suppliedRows(): readonly OrderRow[] {
  if (cachedRows === null) {
    const { rows, errors } = validateRows(readSuppliedRecords());
    if (errors.length > 0) {
      throw new Error(`Supplied CSV failed validation: ${JSON.stringify(errors.slice(0, 5))}`);
    }
    cachedRows = rows;
  }
  return cachedRows;
}

export function suppliedStats(): DatasetStats {
  return computeDatasetStats(suppliedRows());
}

function nodeSqliteDb(database: DatabaseSync): SqlDb {
  return {
    all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const statement = database.prepare(sql);
      return Promise.resolve(statement.all(...(params as SQLInputValue[])) as T[]);
    },
    first<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      const statement = database.prepare(sql);
      const row = statement.get(...(params as SQLInputValue[]));
      return Promise.resolve((row ?? null) as T | null);
    },
  };
}

export interface TestDatabase extends SqlDb {
  readonly raw: DatabaseSync;
  close(): void;
}

/**
 * Build an in-memory database from the real migration and the real generated
 * seed SQL. Passing explicit rows allows narrow scenario fixtures.
 */
export function createTestDatabase(rows: readonly OrderRow[] = suppliedRows()): TestDatabase {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(MIGRATION_PATH, "utf8"));
  database.exec(buildSeedSql(rows, JSON.stringify({ test: true }), "2026-01-01T00:00:00.000Z"));
  const sql = nodeSqliteDb(database);
  return {
    raw: database,
    all: sql.all,
    first: sql.first,
    close: () => database.close(),
  };
}

function makeStatement(
  database: DatabaseSync,
  sql: string,
  params: readonly unknown[],
): D1PreparedStatement {
  return {
    bind: (...values: readonly unknown[]) => makeStatement(database, sql, values),
    all: <T>() =>
      Promise.resolve({
        results: database.prepare(sql).all(...(params as SQLInputValue[])) as T[],
      }),
    first: <T>() =>
      Promise.resolve(
        (database.prepare(sql).get(...(params as SQLInputValue[])) ?? null) as T | null,
      ),
    run: () => {
      database.prepare(sql).run(...(params as SQLInputValue[]));
      return Promise.resolve({ success: true });
    },
  };
}

export interface TestBinding {
  readonly DB: D1Database;
  readonly raw: DatabaseSync;
  close(): void;
}

/**
 * A D1-shaped binding over node:sqlite, so Worker routes can be exercised with
 * the real seeded dataset and the real SQL they run in production.
 */
export function createTestBinding(
  rows: readonly OrderRow[] = suppliedRows(),
  options: { readonly manifestJson?: string } = {},
): TestBinding {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(MIGRATION_PATH, "utf8"));
  let manifestJson = options.manifestJson;
  if (!manifestJson) {
    if (existsSync(MANIFEST_PATH)) {
      manifestJson = readFileSync(MANIFEST_PATH, "utf8");
    } else {
      const stats = computeDatasetStats(rows);
      manifestJson = JSON.stringify({
        data_version: DATA_VERSION,
        metric_version: METRIC_VERSION,
        imported_at: "2026-01-01T00:00:00.000Z",
        source: {
          file: "mock_logistics_data.csv",
          sha256: SUPPLIED_CSV_SHA256,
          bytes: 0,
          checksum_matches_supplied_fixture: true,
        },
        observed: {
          row_count: stats.rowCount,
          order_date_min: stats.observedOrderDateMin,
          order_date_max: stats.observedOrderDateMax,
          delivery_date_max: stats.observedDeliveryDateMax,
        },
        assumed_coverage: {
          start: ASSUMED_COVERAGE_START,
          end: ASSUMED_COVERAGE_END,
          status: "coverage_unverified",
          basis: "Test synthetic observation window.",
        },
        dataset_reference_date: DATASET_REFERENCE_DATE,
        vocabulary: stats.vocabulary,
        assumptions: [],
      });
    }
  }
  database.exec(buildSeedSql(rows, manifestJson, "2026-01-01T00:00:00.000Z"));

  const DB: D1Database = {
    prepare: (sql: string) => makeStatement(database, sql, []),
    batch: <T>() => Promise.resolve([] as T[]),
  };

  return { DB, raw: database, close: () => database.close() };
}
