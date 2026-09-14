import { Hono } from "hono";
import { apiError } from "../shared/errors.ts";
import type { AppEnv } from "./env.ts";
import { apiHeadersMiddleware } from "./middleware/api-headers.ts";
import { registerAskRoutes } from "./routes/ask.ts";
import { registerForecastRoutes } from "./routes/forecast.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { registerMetaRoutes } from "./routes/meta.ts";
import { registerQueryRoutes } from "./routes/query.ts";

const app = new Hono<AppEnv>();

app.use("/api/*", apiHeadersMiddleware);

registerHealthRoutes(app);
registerMetaRoutes(app);
registerQueryRoutes(app);
registerForecastRoutes(app);
registerAskRoutes(app);

/**
 * Unknown routes always return JSON. wrangler.jsonc routes /api and /api/* to
 * the Worker first, including browser navigations, so a mistyped API path can
 * never fall through to the SPA shell and return HTML with a 200 status.
 */
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);
  return c.json(
    apiError("not_found", `No API route matches ${c.req.method} ${pathname}.`),
    404,
  );
});

app.onError((error, c) => {
  // Log the failure shape without echoing request bodies or source rows.
  console.error("server_unhandled_error", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
  });
  return c.json(
    apiError("internal_error", "Unexpected server error. The request was not completed."),
    500,
  );
});

export default app;
