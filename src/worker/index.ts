import { Hono } from "hono";
import { buildMetaResponse, ManifestUnavailableError, readManifest } from "../data/manifest.ts";
import { d1SqlDb } from "./db.ts";
import { parseQueryRequest } from "../domain/query-schema.ts";
import { parseAskRequest } from "../domain/ask-schema.ts";
import { parseForecastRequest } from "../domain/forecast-schema.ts";
import { ForecastError, runForecast } from "../domain/forecast.ts";
import { QueryError, runQuery } from "../domain/query.ts";
import { ConfigError, readLlmConfig, resolveProvider, runAsk } from "./ask.ts";
import { apiError } from "../shared/errors.ts";
import type { Env } from "./env.ts";
import { isCrossOriginBrowserRequest, readJsonBody } from "./request-guard.ts";
import { errorPayload } from "./respond.ts";

const app = new Hono<{ Bindings: Env }>();

/**
 * Restrictive headers on every API response. Analytical results are private to
 * the request scope and must not be cached by intermediaries.
 */
app.use("/api/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
});

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "logistics-analytics-demo",
  }),
);

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

/**
 * Validated deterministic analytics. The same function backs the dashboard and,
 * later, the natural-language path, so the two cannot disagree.
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

/**
 * One question, one validated routing decision, one deterministic computation.
 * Disabled by default: without a configured provider key this returns a clear
 * unavailable state while the query and forecast routes keep working.
 */
app.post("/api/ask", async (c) => {
  if (isCrossOriginBrowserRequest(c.req.raw)) {
    return c.json(...errorPayload("bad_input", "Cross-origin browser requests are not accepted."));
  }

  const body = await readJsonBody(c.req.raw);
  if (!body.ok) {
    return c.json(...errorPayload("bad_input", body.message));
  }

  const parsed = parseAskRequest(body.value);
  if (!parsed.ok) {
    return c.json(
      ...errorPayload("bad_input", "The question request is not valid.", {
        details: parsed.issues,
      }),
    );
  }

  let config;
  try {
    config = readLlmConfig(c.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Misconfiguration must not silently enable a provider call.
      console.error("llm_config_error", { message: error.message });
      return c.json(
        ...errorPayload(
          "provider_disabled",
          "The model configuration is invalid, so natural-language questions are disabled. Deterministic analytics remain available.",
        ),
      );
    }
    throw error;
  }

  const db = d1SqlDb(c.env.DB);
  try {
    const manifest = await readManifest(db);

    if (!config.enabled) {
      return c.json(
        ...errorPayload(
          "provider_disabled",
          "Natural-language questions are turned off because no model provider is configured. The dashboard and the SKU forecast are computed locally and remain available.",
        ),
      );
    }

    const provider = resolveProvider(c.env, config);
    if (!provider.ok) {
      return c.json(
        ...errorPayload(provider.code, provider.message, {
          ...(provider.details === undefined ? {} : { details: provider.details }),
        }),
      );
    }

    const outcome = await runAsk(
      { question: parsed.value.question, dateContext: parsed.value.date_context },
      { db, manifest, config, now: new Date(), provider: provider.client },
    );

    if (!outcome.ok) {
      return c.json(
        ...errorPayload(outcome.code, outcome.message, {
          ...(outcome.details === undefined ? {} : { details: outcome.details }),
          ...(outcome.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: outcome.retryAfterSeconds }),
        }),
      );
    }

    return c.json(outcome.value);
  } catch (error) {
    if (error instanceof ManifestUnavailableError) {
      return c.json(...errorPayload("data_unavailable", error.message));
    }
    throw error;
  }
});

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
  console.error("worker_unhandled_error", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
  });
  return c.json(
    apiError("internal_error", "Unexpected server error. The request was not completed."),
    500,
  );
});

export default app;
