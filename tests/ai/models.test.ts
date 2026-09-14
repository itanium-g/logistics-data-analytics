import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  ESCALATION_MODEL,
  FALLBACK_MODEL,
  isBillingError,
  isComplexReasoning,
  isLongContext,
  routeModel,
} from "../../src/server/ai/models.ts";

describe("Centralized model constants", () => {
  it("defines the exact specified target models", () => {
    expect(DEFAULT_MODEL).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(ESCALATION_MODEL).toBe("@cf/zai-org/glm-5.3-flash");
    expect(FALLBACK_MODEL).toBe("@cf/zai-org/glm-4.7-flash");
  });
});

describe("Complex reasoning detection", () => {
  it("detects comparative queries as complex reasoning", () => {
    expect(isComplexReasoning("Compare delay rate between DHL and FedEx")).toBe(true);
    expect(isComplexReasoning("Show carrier delay rate versus order volume")).toBe(true);
    expect(isComplexReasoning("GLS vs UPS delivery performance")).toBe(true);
    expect(isComplexReasoning("Contrast order values across regions")).toBe(true);
  });

  it("detects correlation and causal queries as complex reasoning", () => {
    expect(isComplexReasoning("Is there a correlation between delivery days and status?")).toBe(true);
    expect(isComplexReasoning("Why did delays spike in December?")).toBe(true);
    expect(isComplexReasoning("Explain why warehouse WH-01 has lower on-time rate")).toBe(true);
    expect(isComplexReasoning("What is the root cause of carrier exceptions?")).toBe(true);
  });

  it("detects trend and breakdown compound requests as complex", () => {
    expect(isComplexReasoning("Show trend vs breakdown for all carriers")).toBe(true);
  });

  it("does not flag standard simple analytics queries", () => {
    expect(isComplexReasoning("How many orders were delayed last month?")).toBe(false);
    expect(isComplexReasoning("What is the total order count?")).toBe(false);
    expect(isComplexReasoning("Show on-time rate by carrier")).toBe(false);
    expect(isComplexReasoning("Forecast units for CRAYON-0008")).toBe(false);
  });
});

describe("Long context detection", () => {
  it("flags queries exceeding estimated token threshold", () => {
    expect(isLongContext("Short question", 3200)).toBe(true);
    expect(isLongContext("Short question", 1500)).toBe(false);
  });

  it("flags queries with character lengths exceeding bound", () => {
    const longQuestion = "a".repeat(550);
    expect(isLongContext(longQuestion)).toBe(true);
    expect(isLongContext("Standard question under 500 chars")).toBe(false);
  });
});

describe("Billing error detection", () => {
  it("identifies status 402 and billing-related messages", () => {
    expect(isBillingError({ status: 402 })).toBe(true);
    expect(isBillingError(new Error("Model requires billing to be enabled"))).toBe(true);
    expect(isBillingError(new Error("Payment Required: active subscription needed"))).toBe(true);
    expect(isBillingError(new Error("Account is not enabled for billing"))).toBe(true);
  });

  it("does not misidentify standard rate limits or timeouts", () => {
    expect(isBillingError(new Error("Rate limit exceeded (429)"))).toBe(false);
    expect(isBillingError(new Error("Request timed out"))).toBe(false);
    expect(isBillingError(null)).toBe(false);
  });
});

describe("Model router policy", () => {
  it("routes standard analytics queries to Gemma 4 by default", () => {
    const decision = routeModel({
      question: "What was the on-time delivery rate last month?",
    });
    expect(decision.model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(decision.reason).toBe("default");
  });

  it("escalates complex reasoning to GLM-5.3 Flash", () => {
    const decision = routeModel({
      question: "Compare carrier performance between DHL and FedEx versus warehouse volume",
      allowPaidEscalation: true,
    });
    expect(decision.model).toBe("@cf/zai-org/glm-5.3-flash");
    expect(decision.reason).toBe("complex_reasoning");
  });

  it("escalates long context requests to GLM-5.3 Flash", () => {
    const decision = routeModel({
      question: "Analyze recent orders",
      estimatedTokens: 3500,
      allowPaidEscalation: true,
    });
    expect(decision.model).toBe("@cf/zai-org/glm-5.3-flash");
    expect(decision.reason).toBe("long_context");
  });

  it("escalates retries to GLM-5.3 Flash", () => {
    const decision = routeModel({
      question: "Standard question",
      isRetry: true,
      allowPaidEscalation: true,
    });
    expect(decision.model).toBe("@cf/zai-org/glm-5.3-flash");
    expect(decision.reason).toBe("retry_escalation");
  });

  it("falls back to GLM-4.7 Flash when billing is disabled on escalation", () => {
    const decision = routeModel({
      question: "Compare DHL vs FedEx",
      billingDisabled: true,
    });
    expect(decision.model).toBe("@cf/zai-org/glm-4.7-flash");
    expect(decision.reason).toBe("billing_fallback");
  });

  it("keeps complex, long and retry routes on the free default by default", () => {
    for (const decision of [
      routeModel({ question: "Compare DHL vs FedEx" }),
      routeModel({ question: "Analyze recent orders", estimatedTokens: 3500 }),
      routeModel({ question: "Standard question", isRetry: true }),
    ]) {
      expect(decision.model).toBe(DEFAULT_MODEL);
      expect(decision.reason).toBe("default");
    }
  });
});
