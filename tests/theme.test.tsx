// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  readThemePreference,
  resolveTheme,
  useTheme,
} from "../src/web/theme.tsx";

type MediaState = {
  matches: boolean;
  readonly listeners: Set<(event: MediaQueryListEvent) => void>;
};

const mediaStates = new Map<string, MediaState>();
let originalMatchMedia: typeof window.matchMedia;
let container: HTMLDivElement;
let root: Root;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function mediaState(query: string): MediaState {
  const existing = mediaStates.get(query);
  if (existing) return existing;
  const state: MediaState = { matches: false, listeners: new Set() };
  mediaStates.set(query, state);
  return state;
}

function installMatchMedia(): void {
  originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const state = mediaState(query);
      return {
        matches: state.matches,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          state.listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          state.listeners.delete(listener);
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    },
  });
}

function setSystemPreference(query: string, matches: boolean): void {
  const state = mediaState(query);
  state.matches = matches;
  const event = { matches, media: query } as MediaQueryListEvent;
  for (const listener of state.listeners) listener(event);
}

function Probe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span id="theme-state">{preference}:{resolvedTheme}</span>
      <button type="button" id="choose-light" onClick={() => setPreference("light")}>Light</button>
      <button type="button" id="choose-dark" onClick={() => setPreference("dark")}>Dark</button>
      <button type="button" id="choose-system" onClick={() => setPreference("system")}>System</button>
    </div>
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mediaStates.clear();
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  installMatchMedia();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container.remove();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

async function mountProbe(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
}

describe("theme preference", () => {
  it("defaults to System and resolves against the operating-system preference", async () => {
    expect(readThemePreference({ getItem: () => null })).toBe("system");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");

    await act(async () => setSystemPreference("(prefers-color-scheme: dark)", true));
    await mountProbe();

    expect(container.querySelector("#theme-state")?.textContent).toBe("system:dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists explicit Light and Dark choices", async () => {
    await mountProbe();

    await act(async () => container.querySelector<HTMLButtonElement>("#choose-dark")?.click());
    expect(container.querySelector("#theme-state")?.textContent).toBe("dark:dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await act(async () => container.querySelector<HTMLButtonElement>("#choose-light")?.click());
    expect(container.querySelector("#theme-state")?.textContent).toBe("light:light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("follows system changes only while System is selected", async () => {
    await mountProbe();

    await act(async () => setSystemPreference("(prefers-color-scheme: dark)", true));
    expect(container.querySelector("#theme-state")?.textContent).toBe("system:dark");

    await act(async () => container.querySelector<HTMLButtonElement>("#choose-light")?.click());
    await act(async () => setSystemPreference("(prefers-color-scheme: dark)", false));
    expect(container.querySelector("#theme-state")?.textContent).toBe("light:light");

    await act(async () => container.querySelector<HTMLButtonElement>("#choose-system")?.click());
    expect(container.querySelector("#theme-state")?.textContent).toBe("system:light");
  });

  it("falls back safely for invalid or inaccessible storage", () => {
    expect(readThemePreference({ getItem: () => "not-a-theme" })).toBe("system");
    expect(readThemePreference({ getItem: () => { throw new Error("storage disabled"); } })).toBe("system");
  });

  it("does not fail when preference persistence is unavailable", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    await mountProbe();

    await act(async () => container.querySelector<HTMLButtonElement>("#choose-dark")?.click());
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
