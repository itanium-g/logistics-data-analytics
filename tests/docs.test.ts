import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { ASK_TOOLS } from "../src/shared/contracts.ts";

const ROOT = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/**
 * Documentation that names commands, variables or counts can drift away from the
 * code silently. These checks fail when it does.
 */
describe("documentation consistency", () => {
  const readme = read("README.md");

  it("only documents npm scripts that exist", () => {
    const referenced = [...readme.matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(5);
    for (const script of new Set(referenced)) {
      expect(Object.keys(packageJson.scripts)).toContain(script);
    }
  });

  it("documents every environment variable the worker reads", () => {
    const envSource = read("src/worker/env.ts");
    const declared = [...envSource.matchAll(/readonly (LLM_[A-Z_]+|GROQ_API_KEY)\?/g)].map(
      (match) => match[1] ?? "",
    );
    expect(declared.length).toBeGreaterThan(8);
    for (const variable of declared) {
      // Every declared binding must appear in the README's variable table.
      expect(readme).toContain(variable);
    }
  });

  it("pins every dependency to an exact version", () => {
    const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const [name, version] of Object.entries(all)) {
      expect(version, `${name} should be pinned exactly`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("states plainly that deployment and live evaluation are outstanding", () => {
    expect(readme).toContain("Not deployed");
    expect(readme).toContain("has not been evaluated");
    const checklist = read("docs/submission-checklist.md");
    expect(checklist).toContain("have not been executed");
  });

  it("keeps the environment example free of real-looking secrets", () => {
    const example = read(".dev.vars.example");
    expect(example).toContain("GROQ_API_KEY=");
    expect(example).toContain("replace-with-your");
    // A real Groq key is a long opaque token; a placeholder must not look like one.
    expect(example).not.toMatch(/gsk_[A-Za-z0-9]{20,}/);
  });
});

describe("frozen evaluation cases", () => {
  const evals = JSON.parse(read("evals/cases.json")) as {
    executed: boolean;
    composition: Record<string, number>;
    cases: { id: string; category: string; expected_tool?: string }[];
  };

  it("holds twenty cases in the documented composition", () => {
    expect(evals.cases).toHaveLength(20);
    const counts = evals.cases.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.category] = (accumulator[entry.category] ?? 0) + 1;
      return accumulator;
    }, {});
    expect(counts).toEqual({
      supported: 12,
      ambiguous_or_missing_input: 4,
      unsupported_or_adversarial: 4,
    });
    expect(evals.composition).toEqual(counts);
  });

  it("uses unique ids and only contract tools", () => {
    const ids = evals.cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of evals.cases) {
      if (entry.expected_tool !== undefined) {
        expect(ASK_TOOLS as readonly string[]).toContain(entry.expected_tool);
      }
    }
  });

  it("records that the set has not been executed against a provider", () => {
    // Flipping this to true requires real recorded results, not an assumption.
    expect(evals.executed).toBe(false);
  });

  it("covers all three brief examples and the adversarial cases", () => {
    const questions = evals.cases.map((entry) => JSON.stringify(entry)).join(" ");
    expect(questions).toContain("delayed orders by week");
    expect(questions).toContain("highest delay rate");
    expect(questions).toContain("delivered late last month");
    expect(questions).toContain("CRAYON-0008");
    expect(questions).toContain("SELECT * FROM orders");
    expect(questions).toContain("must_not_execute");
  });
});
