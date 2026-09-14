import type { SqlDb } from "../../shared/db.ts";
import type { D1Database } from "../env.ts";

/** Adapt the Cloudflare D1 binding to the runtime-neutral SQL port. */
export function d1SqlDb(db: D1Database): SqlDb {
  return {
    async all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const result = await db.prepare(sql).bind(...params).all<T>();
      return result.results;
    },
    async first<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      return db.prepare(sql).bind(...params).first<T>();
    },
  };
}
