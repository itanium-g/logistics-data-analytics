import type { Hono } from "hono";
import { ManifestUnavailableError, readManifest } from "../../data/manifest.ts";
import { parseForecastRequest } from "../../domain/forecast-schema.ts";
import { ForecastError, runForecast } from "../../domain/forecast.ts";
import { d1SqlDb } from "../db/d1.ts";
import type { AppEnv } from "../env.ts";
import { errorPayload } from "../http/respond.ts";
import { isCrossOriginBrowserRequest, readJsonBody } from "../middleware/request-guard.ts";

export function registerForecastRoutes(app: Hono<AppEnv>): void {
  /**
   * Validated deterministic SKU forecast. Same admission guards as the query route.
   */
  app.post("/api/forecast", async (c) => {
    if (isCrossOriginBrowserRequest(c.req.raw)) {
      return c.json(...errorPayload("bad_input", "Cross-origin browser requests are not accepted."));
    }

    const body = await readJsonBody(c.req.raw);
    if (!body.ok) {
      return c.json(...errorPayload("bad_input", body.message));
    }

    const parsed = parseForecastRequest(body.value);
    if (!parsed.ok) {
      return c.json(
        ...errorPayload("bad_input", "The forecast request is not valid.", {
          details: parsed.issues,
        }),
      );
    }

    const db = d1SqlDb(c.env.DB);
    try {
      const manifest = await readManifest(db);
      const result = await runForecast(parsed.value, { db, manifest });
      return c.json(result);
    } catch (error) {
      if (error instanceof ManifestUnavailableError) {
        return c.json(...errorPayload("data_unavailable", error.message));
      }
      if (error instanceof ForecastError) {
        return c.json(
          ...errorPayload(error.code, error.message, {
            details:
              error.field === undefined ? undefined : [{ path: error.field, message: error.message }],
          }),
        );
      }
      throw error;
    }
  });
}
