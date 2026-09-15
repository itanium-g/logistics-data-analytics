import { nativeDecision } from "../helpers/native-ai.ts";
import { describe, expect, it, vi } from "vitest";
import app from "../../src/server/index.ts";
import type { AiBinding } from "../../src/server/env.ts";
import {
  createTestBinding,
  hasSuppliedCsv,
  type TestBinding,
} from "../helpers/dataset.ts";

function wire(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tool: "query_metric",
    query: {
      metrics: ["total_orders"],
      breakdown: null,
      time_grain: null,
      date_field: null,
      date_context: null,
      relative_range: null,
      date_from: null,
      date_to: null,
      filters: null,
      order_by: null,
      order_dir: null,
      limit: null,
    },
    forecast: null,
    clarify: null,
    unsupported: null,
    ...overrides,
  };
}

function mockAi(
  decisionOrFn:
    | unknown
    | ((model: string, inputs: Record<string, unknown>) => Promise<unknown>),
): AiBinding {
  if (typeof decisionOrFn === "function") {
    return { run: decisionOrFn as AiBinding["run"] };
  }
  return {
    run: (async () => nativeDecision(decisionOrFn)) as AiBinding["run"],
  };
}

function enabledEnv(
  binding: TestBinding,
  ai: AiBinding,
  overrides: Record<string, string> = {},
) {
  return {
    DB: binding.DB,
    AI: ai,
    AI_ENABLED: "true",
    AI_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    AI_MIN_INTERVAL_SECONDS: "0",
    ...overrides,
  };
}

async function ask(
  binding: TestBinding,
  question: string,
  ai: AiBinding = mockAi(wire()),
  envOverrides: Record<string, string> = {},
): Promise<Response> {
  return app.request(
    "/api/ask",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    enabledEnv(binding, ai, envOverrides),
  );
}

describe.skipIf(!hasSuppliedCsv)("Workers AI quota admission", () => {
  it("disabling pacing ignores the previous deadline and admits consecutive questions", async () => {
    const binding = createTestBinding();
    try {
      const ai = mockAi(wire());
      expect(
        (
          await ask(binding, "How many orders?", ai, {
            AI_MIN_INTERVAL_SECONDS: "60",
          })
        ).status,
      ).toBe(200);
      for (let i = 0; i < 3; i++) {
        expect(
          (
            await ask(binding, "How many orders?", ai, {
              AI_MIN_INTERVAL_SECONDS: "0",
            })
          ).status,
        ).toBe(200);
      }
      const usage = binding.raw
        .prepare("SELECT day_attempts FROM llm_usage WHERE id = 1")
        .get() as { day_attempts: number };
      expect(usage.day_attempts).toBe(4);
    } finally {
      binding.close();
    }
  });

  it("paces requests and reports a retry-after", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire());

    try {
      const first = await ask(binding, "How many orders?", ai, {
        AI_MIN_INTERVAL_SECONDS: "60",
      });
      expect(first.status).toBe(200);

      const second = await ask(binding, "How many orders?", ai, {
        AI_MIN_INTERVAL_SECONDS: "60",
      });
      expect(second.status).toBe(429);
      const body = (await second.json()) as {
        error: { code: string; message: string; retry_after_seconds?: number };
      };
      expect(body.error.code).toBe("rate_limited");
      expect(body.error.message).toContain("paced");
      expect(body.error.retry_after_seconds).toBeGreaterThan(0);
      expect(body.error.retry_after_seconds).toBeLessThanOrEqual(60);
    } finally {
      binding.close();
    }
  });

  it("admits exactly one caller when concurrent requests race for the last slot", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire());

    try {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          ask(binding, "How many orders?", ai, {
            AI_DAILY_ATTEMPT_LIMIT: "1",
            AI_MIN_INTERVAL_SECONDS: "0",
          }),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 429)).toHaveLength(4);
    } finally {
      binding.close();
    }
  });

  it("enforces the daily attempt, monthly attempt and token limits", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire());

    try {
      const first = await ask(binding, "How many orders?", ai, {
        AI_DAILY_ATTEMPT_LIMIT: "1",
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(first.status).toBe(200);
      const daily = await ask(binding, "How many orders?", ai, {
        AI_DAILY_ATTEMPT_LIMIT: "1",
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(
        ((await daily.json()) as { error: { message: string } }).error.message,
      ).toContain("daily limit of 1 question");

      binding.raw.exec(
        "UPDATE llm_usage SET day_attempts = 0, day_tokens_reserved = 0",
      );
      const tokens = await ask(binding, "How many orders?", ai, {
        AI_DAILY_TOKEN_RESERVATION_LIMIT: "1000",
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(tokens.status).toBe(429);
      expect(
        ((await tokens.json()) as { error: { message: string } }).error.message,
      ).toContain("token reservation");
    } finally {
      binding.close();
    }
  });

  it("retains the reservation after a provider failure", async () => {
    const binding = createTestBinding();
    const failAi: AiBinding = {
      run: vi.fn(async () => {
        const error = new Error("Failed");
        (error as any).status = 500;
        throw error;
      }),
    };

    try {
      const failed = await ask(binding, "How many orders?", failAi, {
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(failed.status).toBe(502);

      const usage = binding.raw
        .prepare(
          "SELECT day_attempts, day_tokens_reserved FROM llm_usage WHERE id = 1",
        )
        .get() as { day_attempts: number; day_tokens_reserved: number };
      // The failed attempt still consumed its reservation.
      expect(usage.day_attempts).toBe(1);
      expect(usage.day_tokens_reserved).toBe(6144 + 512);
    } finally {
      binding.close();
    }
  });

  it("starts a fresh allowance after a UTC day rollover", async () => {
    const binding = createTestBinding();
    const ai = mockAi(wire());

    try {
      const first = await ask(binding, "How many orders?", ai, {
        AI_DAILY_ATTEMPT_LIMIT: "1",
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(first.status).toBe(200);

      // Simulate the stored period belonging to an earlier day.
      binding.raw.exec(
        "UPDATE llm_usage SET day_key = '2020-01-01', month_key = '2020-01'",
      );

      const afterRollover = await ask(binding, "How many orders?", ai, {
        AI_DAILY_ATTEMPT_LIMIT: "1",
        AI_MIN_INTERVAL_SECONDS: "0",
      });
      expect(afterRollover.status).toBe(200);

      const usage = binding.raw
        .prepare(
          "SELECT day_attempts, day_tokens_reserved FROM llm_usage WHERE id = 1",
        )
        .get() as { day_attempts: number; day_tokens_reserved: number };
      expect(usage.day_attempts).toBe(1);
      expect(usage.day_tokens_reserved).toBe(6144 + 512);
    } finally {
      binding.close();
    }
  });

  it("does not consume quota when the provider is disabled", async () => {
    const binding = createTestBinding();
    try {
      await app.request(
        "/api/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "How many orders?" }),
        },
        { DB: binding.DB },
      );
      const usage = binding.raw
        .prepare("SELECT day_attempts FROM llm_usage WHERE id = 1")
        .get() as { day_attempts: number };
      expect(usage.day_attempts).toBe(0);
    } finally {
      binding.close();
    }
  });
});
