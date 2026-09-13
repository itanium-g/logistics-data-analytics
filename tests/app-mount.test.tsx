// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker/index.ts";
import { App } from "../src/web/App.tsx";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

/**
 * Mounts the real application in a DOM and serves its fetch calls from the real
 * Worker over the real seeded dataset. This exercises the path a reviewer takes:
 * load the metric contract, issue the dashboard queries, render the results.
 *
 * Recharts measures its container, which jsdom reports as zero sized, so the SVG
 * itself is not asserted here; the accompanying tables and cards are. The chart
 * elements are checked in the browser smoke run.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;
let binding: TestBinding;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  binding = createTestBinding();
  container = document.createElement("div");
  document.body.appendChild(container);

  // Route browser fetches into the Worker with the seeded binding.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : "/";
    return app.request(path, init ?? {}, { DB: binding.DB });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  binding.close();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function mountApp(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  // Allow the chained dashboard requests to settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function text(): string {
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe.skipIf(!hasSuppliedCsv)("application mount", () => {
  it("loads the metric contract and renders the five KPIs from live queries", async () => {
    await mountApp();

    expect(text()).toContain("Spaceship Logistics Analytics");
    expect(text()).toContain("400 orders");

    expect(text()).toContain("Total orders");
    expect(text()).toContain("Delivered orders");
    expect(text()).toContain("Delayed orders (status proxy)");
    expect(text()).toContain("On-time delivery rate (status proxy)");
    expect(text()).toContain("Average delivery time (delivery-status records)");

    expect(text()).toContain("84.68%");
    expect(text()).toContain("3.69 days");
    expect(text()).toContain("304 of 359 records");
    expect(text()).toContain("359 eligible records");
  });

  it("renders both required chart panels with their evidence", async () => {
    await mountApp();

    expect(text()).toContain("Order volume by month");
    expect(text()).toContain("Orders by status");
    expect(text()).toContain("Evidence: filters, definitions and underlying data");
    expect(text()).toContain("Exception records have an unknown outcome");
  });

  it("exposes the filter controls over server-published vocabulary", async () => {
    await mountApp();

    const rangeSelect = container.querySelector<HTMLSelectElement>("#filter-range");
    const carrierSelect = container.querySelector<HTMLSelectElement>("#filter-carrier");
    const contextSelect = container.querySelector<HTMLSelectElement>("#filter-context");

    expect(rangeSelect).not.toBeNull();
    expect(contextSelect).not.toBeNull();
    expect(carrierSelect).not.toBeNull();

    const carriers = [...(carrierSelect?.options ?? [])].map((option) => option.value);
    expect(carriers).toContain("GLS");
    expect(carriers).toContain("DHL");
    // "All" plus the nine carriers in the dataset.
    expect(carriers).toHaveLength(10);

    const contexts = [...(contextSelect?.options ?? [])].map((option) => option.value);
    expect(contexts).toEqual(["dataset", "current"]);
  });

  it("keeps every control reachable by keyboard", async () => {
    await mountApp();

    const focusable = container.querySelectorAll("select, button, summary");
    expect(focusable.length).toBeGreaterThan(5);
    for (const element of focusable) {
      expect(element.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("shows the status-proxy limitation without needing to open a panel", async () => {
    await mountApp();
    expect(text()).toContain("no promised delivery date");
    expect(text()).toContain("exact SLA compliance cannot be measured");
  });

  it("computes and renders the SKU forecast with its inventory target", async () => {
    await mountApp();

    // The form defaults to the documented acceptance SKU.
    const skuInput = container.querySelector<HTMLInputElement>("#forecast-sku");
    expect(skuInput?.value).toBe("CRAYON-0008");

    const options = container.querySelectorAll("#forecast-sku ~ datalist option, datalist option");
    expect(options.length).toBeGreaterThan(300);

    const form = container.querySelector("form.forecast-form");
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const rendered = text();
    expect(rendered).toContain("units of demand coverage to plan for CRAYON-0008");
    expect(rendered).toContain("Plan coverage for 3 units");
    expect(rendered).toContain("Jan 2026 to Apr 2026");
    // History and forecast months both appear in the accompanying table.
    expect(rendered).toContain("Jan 2025");
    expect(rendered).toContain("Apr 2026");
    expect(rendered).toContain("Recorded");
    expect(rendered).toContain("Forecast");
    // Methodology and limitations are shown with the number.
    expect(rendered).toContain("12-month mean of recorded monthly units");
    expect(rendered).toContain("not a net purchase quantity");
    expect(rendered).toContain("coverage_unverified");
  });

  it("shows an honest unavailable state for questions while other panels work", async () => {
    await mountApp();

    expect(text()).toContain("Ask a question");
    expect(text()).toContain("no number here is generated text");

    const askForm = container.querySelector("form.ask-form");
    expect(askForm).not.toBeNull();
    await act(async () => {
      askForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const rendered = text();
    // No provider is configured in this environment, so the panel says so
    // clearly and explains how to enable it.
    expect(rendered).toContain("no model provider is configured");
    expect(rendered).toContain("GROQ_API_KEY");
    // The deterministic panels are still present and populated.
    expect(rendered).toContain("84.68%");
    expect(rendered).toContain("SKU demand forecast and inventory target");
  });
});
