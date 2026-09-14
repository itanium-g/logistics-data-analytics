// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/server/index.ts";
import { App } from "../src/client/app/App.tsx";
import { createTestBinding, hasSuppliedCsv, type TestBinding } from "./helpers/dataset.ts";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;
let binding: TestBinding;

function installMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("1024") || query.includes("1280") || query.includes("1536") ? false : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

async function mount(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 75)));
}

describe.skipIf(!hasSuppliedCsv)("application shell", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "#forecasts");
    window.localStorage.removeItem("spaceship.theme");
    installMatchMedia();
    binding = createTestBinding();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : "/";
      return app.request(path, init ?? {}, { DB: binding.DB });
    });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    binding.close();
    vi.unstubAllGlobals();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("keeps direct Forecasts navigation and skip-link focus on the same hash", async () => {
    await mount();
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("Forecasts");
    const skip = container.querySelector<HTMLAnchorElement>(".skip-link");
    expect(skip).not.toBeNull();
    await act(async () => skip?.click());
    expect(window.location.hash).toBe("#forecasts");
    expect(document.activeElement).toBe(container.querySelector("#main-content"));
  });

  it("opens the narrow navigation as a native dialog and locks body scroll", async () => {
    await mount();
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-nav-trigger");
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    const dialog = container.querySelector<HTMLDialogElement>("dialog.navigation-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const close = dialog?.querySelector<HTMLButtonElement>(".mobile-dialog-header button");
    await act(async () => close?.click());
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
});
