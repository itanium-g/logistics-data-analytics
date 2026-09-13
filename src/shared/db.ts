/**
 * Runtime-neutral read abstraction over SQLite-compatible engines.
 *
 * Domain and data code depend on this port rather than a Worker binding.
 * The Worker and test runtimes provide the concrete adapters.
 */
export interface SqlDb {
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly unknown[]): Promise<T | null>;
}
