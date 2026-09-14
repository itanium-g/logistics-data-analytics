import { describe, expect, it } from "vitest";
import { readAiConfig } from "../../src/server/ai/config.ts";
import type { Env } from "../../src/server/env.ts";

describe("Workers AI cost policy configuration", () => {
  it("defaults paid escalation to off", () => {
    const config = readAiConfig({} as Env);

    expect(config.allowPaidEscalation).toBe(false);
    expect(config.model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(config.escalationModel).toBe("@cf/zai-org/glm-5.3-flash");
    expect(config.fallbackModel).toBe("@cf/zai-org/glm-4.7-flash");
  });

  it("requires an explicit true value to enable paid escalation", () => {
    expect(
      readAiConfig({ AI_ALLOW_PAID_ESCALATION: "true" } as Env).allowPaidEscalation,
    ).toBe(true);
    expect(() => readAiConfig({ AI_ALLOW_PAID_ESCALATION: "yes" } as Env)).toThrow(
      'AI_ALLOW_PAID_ESCALATION must be exactly "true" or "false"',
    );
  });
});
