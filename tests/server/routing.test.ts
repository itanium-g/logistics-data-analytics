import { describe, expect, it } from "vitest";
import app from "../../src/server/index.ts";
import {
  ConfigError,
  parseBooleanVar,
  parseEnumVar,
  parseIntVar,
} from "../../src/server/env.ts";

describe("API routing boundary", () => {
  it("serves health as JSON", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("returns a typed JSON 404 for unknown API routes", async () => {
    const response = await app.request("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/api/does-not-exist");
  });

  it("returns JSON 404 for an API browser navigation, never SPA HTML", async () => {
    const response = await app.request("/api/orders", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Mode": "navigate",
      },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    const text = await response.text();
    expect(text).not.toContain("<!doctype html>");
  });

  it("applies restrictive headers to API responses", async () => {
    const response = await app.request("/api/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("environment parsing", () => {
  it('treats the string "false" as false, not truthy', () => {
    expect(parseBooleanVar("AI_ENABLED", "false", true)).toBe(false);
    expect(parseBooleanVar("AI_ENABLED", "FALSE", true)).toBe(false);
    expect(parseBooleanVar("AI_ENABLED", "true", false)).toBe(true);
  });

  it("falls back only when the value is absent or empty", () => {
    expect(parseBooleanVar("AI_ENABLED", undefined, false)).toBe(false);
    expect(parseBooleanVar("AI_ENABLED", "", true)).toBe(true);
  });

  it("rejects ambiguous boolean spellings instead of guessing", () => {
    for (const raw of ["0", "1", "no", "yes", "off", "disabled"]) {
      expect(() => parseBooleanVar("AI_ENABLED", raw, false)).toThrow(ConfigError);
    }
  });

  it("parses bounded integers and rejects out-of-range or non-numeric values", () => {
    expect(parseIntVar("AI_MAX_INPUT_TOKENS", "4096", 1, { min: 1, max: 8192 })).toBe(4096);
    expect(parseIntVar("AI_MAX_INPUT_TOKENS", undefined, 4096, { min: 1, max: 8192 })).toBe(
      4096,
    );
    expect(() =>
      parseIntVar("AI_MAX_INPUT_TOKENS", "99999", 1, { min: 1, max: 8192 }),
    ).toThrow(ConfigError);
    expect(() => parseIntVar("AI_MAX_INPUT_TOKENS", "4096.5", 1, { min: 1, max: 8192 })).toThrow(
      ConfigError,
    );
    expect(() => parseIntVar("AI_MAX_INPUT_TOKENS", "-1", 1, { min: 1, max: 8192 })).toThrow(
      ConfigError,
    );
  });

  it("rejects unknown provider or billing values", () => {
    expect(parseEnumVar("AI_BILLING_MODE", "free", ["free", "paid"] as const, "free")).toBe(
      "free",
    );
    expect(() =>
      parseEnumVar("AI_BILLING_MODE", "unknown-billing", ["free"] as const, "free"),
    ).toThrow(ConfigError);
  });
});
