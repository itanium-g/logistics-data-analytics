// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskResponse, MetaResponse } from "../src/shared/contracts.ts";
import { ApiError } from "../src/client/lib/api.ts";
import { AskPanel } from "../src/client/features/assistant/AskPanel.tsx";

const { postAskMock } = vi.hoisted(() => ({ postAskMock: vi.fn() }));

vi.mock("../src/client/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/client/lib/api.ts")>("../src/client/lib/api.ts");
  return { ...actual, postAsk: postAskMock };
});

let container: HTMLDivElement;
let root: Root;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const meta = {
  dataset_reference_date: "2026-01-01",
  vocabulary: { skus: ["CRAYON-0008"], sku_count: 1 },
} as unknown as MetaResponse;

const computedResponse: AskResponse = {
  question: "Which carrier has the highest delay rate?",
  tool: "query_metric",
  answer: "GLS has the highest delay rate at 28.57%.",
  interpretation: { tool: "query_metric", summary: "Rank carriers by documented delay rate." },
  query: null,
  forecast: null,
  clarification: null,
  unsupported: null,
  provider: { name: "deterministic", model: "none" },
  usage: { input_tokens_estimated: 9, max_output_tokens: 256 },
  data_version: "data 1.0.0",
  metric_version: "metric 2",
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  postAskMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function mountPanel(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(<AskPanel meta={meta} open modal onClose={vi.fn()} />);
  });
}

async function submitPrompt(label: string): Promise<void> {
  const prompt = [...container.querySelectorAll<HTMLButtonElement>("button.prompt-chip")].find((button) =>
    button.textContent?.includes(label),
  );
  expect(prompt).not.toBeUndefined();
  await act(async () => prompt?.click());
  await act(async () => container.querySelector<HTMLFormElement>("form.ask-form")?.requestSubmit());
  await act(async () => Promise.resolve());
}

describe("AI Analyst presentation", () => {
  it("associates the computed result with the submitted question and context", async () => {
    postAskMock.mockResolvedValue(computedResponse);
    await mountPanel();

    const context = container.querySelector<HTMLSelectElement>("#ask-context");
    expect(context).not.toBeNull();
    if (!context) return;
    await act(async () => {
      context.value = "current";
      context.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submitPrompt("highest delay rate");

    expect(postAskMock).toHaveBeenCalledWith({
      question: "Which carrier has the highest delay rate?",
      date_context: "current",
    });
    expect(container.textContent).toContain("GLS has the highest delay rate at 28.57%.");
    expect(container.textContent).toContain("Which carrier has the highest delay rate?");

    const secondPrompt = [...container.querySelectorAll<HTMLButtonElement>("button.prompt-chip")].find((button) =>
      button.textContent?.includes("delivered late last month"),
    );
    await act(async () => secondPrompt?.click());
    expect(container.querySelector(".submitted-question")?.textContent).toContain(
      "Which carrier has the highest delay rate?",
    );
  });

  it("renders provider errors with the submitted question intact", async () => {
    postAskMock.mockRejectedValue(
      new ApiError(
        "rate_limited",
        "Please wait before asking another question.",
        [{ path: "question", message: "Retry after the cooldown." }],
        12,
      ),
    );
    await mountPanel();
    await submitPrompt("highest delay rate");

    expect(container.textContent).toContain("The question limit has been reached");
    expect(container.textContent).toContain("Please wait before asking another question.");
    expect(container.textContent).toContain("Retry after the cooldown.");
    expect(container.textContent).toContain("Which carrier has the highest delay rate?");
    expect(container.querySelector("button.secondary-button")).not.toBeNull();
  });

  it("renders unsupported responses as a recoverable alternative", async () => {
    postAskMock.mockResolvedValue({
      ...computedResponse,
      tool: "unsupported",
      answer: "That request is outside the supported metric vocabulary.",
      interpretation: { tool: "unsupported", summary: "No safe metric plan matched the question." },
      unsupported: {
        reason: "The source does not contain promised delivery dates.",
        alternative: "Ask for the on-time status proxy.",
      },
    } satisfies AskResponse);
    await mountPanel();
    await submitPrompt("highest delay rate");

    expect(container.textContent).toContain("That request is outside the supported metric vocabulary.");
    expect(container.textContent).toContain("Closest supported question");
    expect(container.textContent).toContain("Ask for the on-time status proxy.");
  });
});
