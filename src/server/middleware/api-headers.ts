import type { MiddlewareHandler } from "hono";

/**
 * Restrictive headers on every API response. Analytical results are private to
 * the request scope and must not be cached by intermediaries.
 */
export const apiHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
};
