import type { Hono } from "hono";
import { buildMetaResponse, ManifestUnavailableError, readManifest } from "../../data/manifest.ts";
import { d1SqlDb } from "../db/d1.ts";
import type { AppEnv } from "../env.ts";
import { errorPayload } from "../http/respond.ts";

export function registerMetaRoutes(app: Hono<AppEnv>): void {
  /**
   * Metric definitions, filter vocabulary, coverage and versions. The browser and
   * the prompt builder both read their vocabulary from here rather than embedding
   * a second copy of the dataset's facts.
   */
  app.get("/api/meta", async (c) => {
    const db = d1SqlDb(c.env.DB);
    try {
      const manifest = await readManifest(db);
      return c.json(buildMetaResponse(manifest));
    } catch (error) {
      if (error instanceof ManifestUnavailableError) {
        return c.json(...errorPayload("data_unavailable", error.message));
      }
      throw error;
    }
  });
}
