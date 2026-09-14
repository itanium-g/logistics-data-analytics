import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { MetaResponse } from "../../shared/contracts.ts";
import { ApiError, fetchMeta } from "../lib/api.ts";
import { Dashboard } from "./Dashboard.tsx";
import { useMediaQuery } from "../hooks/useMediaQuery.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { AppSidebar } from "../components/AppSidebar.tsx";
import { AskPanel } from "../features/assistant/AskPanel.tsx";
import { ForecastPanel } from "../features/forecast/ForecastPanel.tsx";
import { ThemeProvider } from "./theme.tsx";

export type WorkspaceView = "overview" | "forecasts";

type MetaState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly meta: MetaResponse }
  | { readonly kind: "error"; readonly message: string; readonly hint: string | null };

function workspaceFromHash(hash: string): WorkspaceView {
  return hash.toLowerCase() === "#forecasts" ? "forecasts" : "overview";
}

function useWorkspaceView(): WorkspaceView {
  const [view, setView] = useState<WorkspaceView>(() => workspaceFromHash(window.location.hash));

  useEffect(() => {
    const sync = (): void => {
      const normalized = window.location.hash.toLowerCase();
      if (normalized !== "#overview" && normalized !== "#forecasts") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#overview`,
        );
        setView("overview");
        return;
      }
      setView(workspaceFromHash(normalized));
    };

    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return view;
}

function AppShell() {
  const [state, setState] = useState<MetaState>({ kind: "loading" });
  const view = useWorkspaceView();
  const isDesktopNavigation = useMediaQuery("(min-width: 1024px)");
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isVeryWide = useMediaQuery("(min-width: 1536px)");
  const [assistantOpen, setAssistantOpen] = useState(isWide);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const assistantTouched = useRef(false);
  const previousWide = useRef(isWide);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);

  const assistantDocked = isWide && assistantOpen;
  const forcedRail = assistantDocked && !isVeryWide;
  const effectiveSidebarCollapsed = forcedRail || sidebarCollapsed;

  useEffect(() => {
    const wasWide = previousWide.current;
    if (wasWide && !isWide) {
      setAssistantOpen(false);
    } else if (!wasWide && isWide && !assistantTouched.current) {
      setAssistantOpen(true);
    }
    previousWide.current = isWide;
  }, [isWide]);

  useEffect(() => {
    if (isDesktopNavigation) setNavigationOpen(false);
  }, [isDesktopNavigation]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const meta = await fetchMeta(controller.signal);
        setState({ kind: "ready", meta });
      } catch (error) {
        if (controller.signal.aborted) return;
        const isDataMissing = error instanceof ApiError && error.code === "data_unavailable";
        setState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "The analytics API could not be reached.",
          hint: isDataMissing
            ? "Run npm run data:import, then npm run db:migrate and npm run db:seed."
            : null,
        });
      }
    })();
    return () => controller.abort();
  }, []);

  const toggleAssistant = (): void => {
    assistantTouched.current = true;
    setNavigationOpen(false);
    setAssistantOpen((open) => !open);
  };

  const closeAssistant = (): void => {
    assistantTouched.current = true;
    setAssistantOpen(false);
  };

  const openNavigation = (): void => {
    setNavigationOpen(true);
    if (assistantOpen) {
      assistantTouched.current = true;
      setAssistantOpen(false);
    }
  };

  const toggleSidebar = (): void => {
    if (forcedRail) return;
    setSidebarCollapsed((collapsed) => !collapsed);
  };

  const meta = state.kind === "ready" ? state.meta : null;
  const isOverview = view === "overview";

  const onSkip = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    document.getElementById("main-content")?.focus();
  };

  return (
    <div className={`app-shell${effectiveSidebarCollapsed ? " sidebar-is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content" onClick={onSkip}>
        Skip to content
      </a>

      <AppSidebar
        view={view}
        collapsed={effectiveSidebarCollapsed}
        forcedRail={forcedRail}
        meta={meta}
        desktop={isDesktopNavigation}
        mobileOpen={navigationOpen}
        onToggle={toggleSidebar}
        onNavigate={() => setNavigationOpen(false)}
        onCloseMobile={() => setNavigationOpen(false)}
        returnFocusRef={navigationTriggerRef}
      />

      <div className="app-frame">
        <AppHeader
          view={view}
          meta={meta}
          assistantOpen={assistantOpen}
          sidebarCollapsed={effectiveSidebarCollapsed}
          sidebarForcedRail={forcedRail}
          assistantTriggerRef={assistantTriggerRef}
          navigationTriggerRef={navigationTriggerRef}
          onOpenNavigation={openNavigation}
          onToggleAssistant={toggleAssistant}
        />

        <div
          className={`app-body${assistantOpen ? " assistant-open" : " assistant-closed"}${assistantDocked ? " assistant-docked" : ""}`}
        >
          <main id="main-content" className="app-main" tabIndex={-1}>
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Logistics intelligence / {isOverview ? "Overview" : "Forecasts"}</p>
                <h1>{isOverview ? "Overview" : "Demand forecasts"}</h1>
                <p className="workspace-description">
                  {isOverview
                    ? "A focused view of order health, delivery performance, and operational scope."
                    : "Plan demand coverage from the recorded order history without shifting the dataset timeline."}
                </p>
              </div>
              {meta !== null && (
                <div className="workspace-context">
                  <span className="workspace-context-label">Observed window</span>
                  <strong>{meta.observed.order_date_min} — {meta.observed.order_date_max}</strong>
                  <span>{meta.observed.row_count} imported orders · data {meta.data_version}</span>
                </div>
              )}
            </div>

            {state.kind === "loading" && (
              <section className="state-panel" role="status" aria-live="polite">
                <span className="loading-mark" aria-hidden="true" />
                <div>
                  <strong>Loading your workspace</strong>
                  <p>Reading the published metric contract and dataset metadata.</p>
                </div>
              </section>
            )}

            {state.kind === "error" && (
              <section className="state-panel state-panel-error" role="alert">
                <span className="state-icon" aria-hidden="true">!</span>
                <div>
                  <strong>Analytics unavailable</strong>
                  <p>{state.message}</p>
                  {state.hint !== null && <p className="hint">{state.hint}</p>}
                </div>
              </section>
            )}

            {meta !== null && (
              <div className="workspace-views">
                <Dashboard meta={meta} active={isOverview} />
                <ForecastPanel meta={meta} active={!isOverview} />
              </div>
            )}
          </main>

          {meta !== null && (
            <AskPanel
              meta={meta}
              open={assistantOpen}
              modal={!isWide}
              onClose={closeAssistant}
              triggerRef={assistantTriggerRef}
            />
          )}
        </div>

        <footer className="app-footer">
          <p>
            Delivery rates use documented status proxies. The supplied records contain no promised delivery date or SLA threshold,
            so exact SLA compliance is not measured; exception records stay separate from delayed orders.
          </p>
          <p className="footer-meta">Metric definitions and source rows are available in each evidence disclosure.</p>
        </footer>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
