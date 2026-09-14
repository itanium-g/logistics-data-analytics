import type { Hono } from "hono";
import { ManifestUnavailableError, readManifest } from "../../data/manifest.ts";
import { parseQueryRequest } from "../../domain/query-schema.ts";
import { QueryError, runQuery } from "../../domain/query.ts";
import { d1SqlDb } from "../db/d1.ts";
import type { AppEnv } from "../env.ts";
import { errorPayload } from "../http/respond.ts";
import { isCrossOriginBrowserRequest, readJsonBody } from "../middleware/request-guard.ts";

export function registerQueryRoutes(app: Hono<AppEnv>): void {
  /**
   * Validated deterministic analytics. The same function backs the dashboard and
   * the natural-language path, so the two cannot disagree.
   */
  app.post("/api/query", async (c) => {
    if (isCrossOriginBrowserRequest(c.req.raw)) {
      return c.json(...errorPayload("bad_input", "Cross-origin browser requests are not accepted."));
    }

    const body = await readJsonBody(c.req.raw);
    if (!body.ok) {
      return c.json(...errorPayload("bad_input", body.message));
    }

    const parsed = parseQueryRequest(body.value);
    if (!parsed.ok) {
      return c.json(
        ...errorPayload("bad_input", "The query request is not valid.", {
          details: parsed.issues,
        }),
      );
    }

    const db = d1SqlDb(c.env.DB);
    try {
      const manifest = await readManifest(db);
      const result = await runQuery(parsed.value, { db, manifest, now: new Date() });
      return c.json(result);
    } catch (error) {
      if (error instanceof ManifestUnavailableError) {
        return c.json(...errorPayload("data_unavailable", error.message));
      }
      if (error instanceof QueryError) {
        return c.json(
          ...errorPayload(error.code, error.message, {
            details: error.field === undefined ? undefined : [{ path: error.field, message: error.message }],
          }),
        );
      }
      throw error;
    }
  });
}
