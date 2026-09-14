import type { Hono } from "hono";
import type { AppEnv } from "../env.ts";

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      service: "logistics-analytics-demo",
    }),
  );
}
