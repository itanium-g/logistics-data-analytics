// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker/index.ts";
import { App } from "../src/web/App.tsx";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

/**
 * Mounts the real application in a DOM and serves its fetch calls from the
 * real Worker over the seeded dataset. Recharts is intentionally covered by
 * browser smoke checks because jsdom cannot provide useful measurements.
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
  window.history.replaceState({}, "", "#overview");
  window.localStorage.removeItem("spaceship.theme");
  binding = createTestBinding();
  container = document.createElement("div");
  document.body.appendChild(container);

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : "/";
    return app.request(path, init ?? {}, { DB: binding.DB });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  binding.close();
  vi.unstubAllGlobals();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function waitForRequests(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 75));
  });
}

async function mountApp(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await waitForRequests();
}

async function navigateTo(view: "overview" | "forecasts"): Promise<void> {
  await act(async () => {
    window.history.pushState({}, "", `#${view}`);
    window.dispatchEvent(new Event("hashchange"));
  });
  await waitForRequests();
}

function text(): string {
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe.skipIf(!hasSuppliedCsv)("application mount", () => {
  it("loads the metric contract and renders the five KPIs from live queries", async () => {
    await mountApp();

    expect(text()).toContain("Spaceship Logistics Analytics");
    expect(text()).toContain("400 imported orders");
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

  it("exposes filter controls over the server-published vocabulary", async () => {
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
    expect(carriers).toHaveLength(10);

    const contexts = [...(contextSelect?.options ?? [])].map((option) => option.value);
    expect(contexts).toEqual(["dataset", "current"]);
  });

  it("keeps controls reachable by keyboard", async () => {
    await mountApp();

    const focusable = container.querySelectorAll("select, button, summary");
    expect(focusable.length).toBeGreaterThan(5);
    for (const element of focusable) {
      expect(element.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("enables complete reset when only date context or date basis changes", async () => {
    await mountApp();

    const contextSelect = container.querySelector<HTMLSelectElement>("#filter-context");
    const dateFieldSelect = container.querySelector<HTMLSelectElement>("#filter-datefield");
    const reset = container.querySelector<HTMLButtonElement>("button.link-button");
    expect(contextSelect).not.toBeNull();
    expect(dateFieldSelect).not.toBeNull();
    expect(reset).not.toBeNull();
    if (!contextSelect || !dateFieldSelect || !reset) return;

    await choose(contextSelect, "current");
    expect(reset.disabled).toBe(false);
    await act(async () => reset.click());
    expect(contextSelect.value).toBe("dataset");
    expect(dateFieldSelect.value).toBe("order_date");
    expect(reset.disabled).toBe(true);

    await choose(dateFieldSelect, "delivery_date");
    expect(reset.disabled).toBe(false);
    await act(async () => reset.click());
    expect(dateFieldSelect.value).toBe("order_date");
    expect(contextSelect.value).toBe("dataset");
    expect(reset.disabled).toBe(true);
  });

  it("shows the status-proxy limitation without needing to open evidence", async () => {
    await mountApp();

    expect(text()).toContain("no promised delivery date");
    expect(text()).toContain("not an exact SLA measurement");
  });

  it("executes the SKU forecast after navigating to Forecasts", async () => {
    await mountApp();
    await navigateTo("forecasts");

    const skuInput = container.querySelector<HTMLInputElement>("#forecast-sku");
    expect(skuInput?.value).toBe("CRAYON-0008");
    const options = container.querySelectorAll("#forecast-sku ~ datalist option, datalist option");
    expect(options.length).toBeGreaterThan(300);

    const form = container.querySelector<HTMLFormElement>("form.forecast-form");
    expect(form).not.toBeNull();
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await waitForRequests();

    const rendered = text();
    expect(rendered).toContain("units of demand coverage to plan for CRAYON-0008");
    expect(rendered).toContain("Plan coverage for 3 units");
    expect(rendered).toContain("Jan 2026 to Apr 2026");
    expect(rendered).toContain("Jan 2025");
    expect(rendered).toContain("Apr 2026");
    expect(rendered).toContain("Recorded");
    expect(rendered).toContain("Forecast");
    expect(rendered).toContain("12-month mean of recorded monthly units");
    expect(rendered).toContain("not a net purchase quantity");
    expect(rendered).toContain("coverage_unverified");
  });

  it("opens the assistant and preserves its unavailable response", async () => {
    await mountApp();

    const trigger = container.querySelector<HTMLButtonElement>("button.assistant-trigger");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger?.click());

    const prompt = [...container.querySelectorAll<HTMLButtonElement>("button.prompt-chip")].find((button) =>
      button.textContent?.includes("highest delay rate"),
    );
    const askForm = container.querySelector<HTMLFormElement>("form.ask-form");
    expect(prompt).not.toBeUndefined();
    expect(askForm).not.toBeNull();
    await act(async () => prompt?.click());
    await act(async () => askForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await waitForRequests();

    const rendered = text();
    expect(rendered).toContain("Which carrier has the highest delay rate?");
    expect(rendered).toContain("AI Analyst is not configured");
    expect(rendered).toContain("no model provider is configured");
    expect(rendered).toContain("84.68%");
    expect(rendered).toContain("On-time delivery rate (status proxy)");
  });

  it("gives every evidence disclosure a unique labelled target", async () => {
    await mountApp();

    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const disclosure of container.querySelectorAll<HTMLElement>("[aria-labelledby]")) {
      const targetId = disclosure.getAttribute("aria-labelledby");
      expect(targetId).not.toBeNull();
      expect(targetId === null ? null : document.getElementById(targetId)).not.toBeNull();
    }
  });

  it("preserves Overview filters while switching workspaces", async () => {
    await mountApp();

    const carrier = container.querySelector<HTMLSelectElement>("#filter-carrier");
    expect(carrier).not.toBeNull();
    if (!carrier) return;
    await choose(carrier, "GLS");
    expect(carrier.value).toBe("GLS");

    await navigateTo("forecasts");
    expect(container.querySelector(".forecast-workspace")).not.toBeNull();
    await navigateTo("overview");
    expect(container.querySelector<HTMLSelectElement>("#filter-carrier")?.value).toBe("GLS");
  });
});
