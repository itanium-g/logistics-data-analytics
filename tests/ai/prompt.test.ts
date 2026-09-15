import { describe, expect, it } from "vitest";
import { buildPrompt, estimateTokens, extractSkuCandidates } from "../../src/domain/prompt.ts";
import { createTestBinding, hasSuppliedCsv, suppliedRows } from "../helpers/dataset.ts";

describe("prompt construction", () => {
  it("extracts only SKU identifiers that exist in the data", () => {
    const known = ["CRAYON-0008", "PAPER-0197"];
    expect(extractSkuCandidates("Forecast CRAYON-0008 please", known)).toEqual(["CRAYON-0008"]);
    expect(extractSkuCandidates("forecast crayon-0008", known)).toEqual(["CRAYON-0008"]);
    expect(extractSkuCandidates("Forecast WIDGET-1234", known)).toEqual([]);
    expect(extractSkuCandidates("How many orders?", known)).toEqual([]);
  });

  it("estimates tokens conservatively", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("a".repeat(300))).toBe(100);
  });
});

describe.skipIf(!hasSuppliedCsv)("prompt content", () => {
  it("never includes all SKUs, source rows or computed results", async () => {
    const binding = createTestBinding();
    try {
      const manifest = JSON.parse(
        (
          await binding.DB.prepare("SELECT manifest_json FROM data_manifest WHERE id = 1").first<{
            manifest_json: string;
          }>()
        )?.manifest_json ?? "{}",
      );

      const prompt = buildPrompt({
        question: "Which carrier has the highest delay rate?",
        manifest,
        dateContext: "dataset",
        referenceDate: "2026-01-01",
      });

      expect(prompt.user).toContain("Which carrier has the highest delay rate?");
      expect(prompt.user).toContain("355 known identifiers");
      // The list itself is absent; only a count and any literal candidates.
      expect(prompt.user).not.toContain("PAPER-0197");
      expect(prompt.user).toContain("only these appear in the question: none");
      // No order identifiers or computed values leak in.
      const firstOrderId = suppliedRows()[0]?.order_id ?? "";
      expect(prompt.user).not.toContain(firstOrderId);
      expect(prompt.user).not.toContain("84.68");
      // Small vocabularies are included so filters can be chosen.
      expect(prompt.user).toContain("GLS");
      expect(prompt.user).toContain("US-C");
      expect(prompt.system).toContain("Never compute final business values");
    } finally {
      binding.close();
    }
  });

  it("passes a literal SKU candidate through but not the whole catalogue", async () => {
    const binding = createTestBinding();
    try {
      const manifest = JSON.parse(
        (
          await binding.DB.prepare("SELECT manifest_json FROM data_manifest WHERE id = 1").first<{
            manifest_json: string;
          }>()
        )?.manifest_json ?? "{}",
      );
      const prompt = buildPrompt({
        question: "Predict demand for SKU CRAYON-0008 for the next 4 months",
        manifest,
        dateContext: "dataset",
        referenceDate: "2026-01-01",
      });
      expect(prompt.skuCandidates).toEqual(["CRAYON-0008"]);
      expect(prompt.user).toContain("only these appear in the question: CRAYON-0008");
      expect(prompt.estimatedInputTokens).toBeLessThan(4096);
    } finally {
      binding.close();
    }
  });
});
