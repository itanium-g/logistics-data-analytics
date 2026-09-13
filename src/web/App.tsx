import { useEffect, useRef, useState } from "react";
import type { MetaResponse } from "../shared/contracts.ts";
import { ApiError, fetchMeta } from "./api.ts";
import { Dashboard } from "./Dashboard.tsx";
import { AskPanel } from "./components/AskPanel.tsx";
import { Icon } from "./components/Icons.tsx";
import { ForecastPanel } from "./components/ForecastPanel.tsx";
import { ThemeProvider, useTheme } from "./theme.tsx";

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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}

function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <label className="theme-control">
      <span>Theme</span>
      <select
        id="theme-preference"
        aria-label="Theme preference"
        value={preference}
        onChange={(event) => setPreference(event.target.value as typeof preference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

function AppShell() {
  const [state, setState] = useState<MetaState>({ kind: "loading" });
  const view = useWorkspaceView();
  const isWide = useMediaQuery("(min-width: 1280px)");
  const [assistantOpen, setAssistantOpen] = useState(isWide);
  const assistantTouched = useRef(false);
  const previousWide = useRef(isWide);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const wasWide = previousWide.current;
    if (wasWide && !isWide) {
      // A docked panel becomes an overlay/full-screen panel at this boundary.
      // Close it, but leave its draft, response, and request state mounted.
      setAssistantOpen(false);
    } else if (!wasWide && isWide && !assistantTouched.current) {
      setAssistantOpen(true);
    }
    previousWide.current = isWide;
  }, [isWide]);

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
    setAssistantOpen((open) => !open);
  };

  const closeAssistant = (): void => {
    assistantTouched.current = true;
    setAssistantOpen(false);
  };

  const isOverview = view === "overview";
  const meta = state.kind === "ready" ? state.meta : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="app-header">
        <div className="header-primary">
          <a className="brand" href="#overview" aria-label="Spaceship Logistics Analytics overview">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="activity" size={18} />
            </span>
            <span className="brand-copy">
              <span className="brand-name">Spaceship Logistics Analytics</span>
              <span className="brand-context">Operations workspace</span>
            </span>
          </a>

          <nav className="workspace-nav" aria-label="Workspace">
            <a
              href="#overview"
              className={isOverview ? "is-active" : ""}
              aria-current={isOverview ? "page" : undefined}
            >
              Overview
            </a>
            <a
              href="#forecasts"
              className={!isOverview ? "is-active" : ""}
              aria-current={!isOverview ? "page" : undefined}
            >
              Forecasts
            </a>
          </nav>
        </div>

        <div className="header-actions">
          {meta !== null && (
            <span
              className="dataset-badge"
              title={`${meta.assumed_coverage.start} to ${meta.assumed_coverage.end}`}
            >
              <span className="status-dot" aria-hidden="true" />
              <span>Data {meta.data_version}</span>
              <span aria-hidden="true">·</span>
              <span>{meta.observed.row_count} records</span>
            </span>
          )}
          <ThemeSelector />
          <button
            ref={assistantTriggerRef}
            type="button"
            className={`assistant-trigger${assistantOpen ? " is-open" : ""}`}
            aria-controls="ai-analyst-panel"
            aria-expanded={assistantOpen}
            onClick={toggleAssistant}
            disabled={meta === null}
          >
            <Icon name="spark" size={15} />
            <span>AI Analyst</span>
            <span className="trigger-state">{assistantOpen ? "Open" : "Ask"}</span>
          </button>
        </div>
      </header>

      <div className={`app-body${assistantOpen ? "" : " assistant-closed"}`}>
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
              <div className="coverage-note">
                <span className="coverage-note-label">Observed window</span>
                <strong>
                  {meta.observed.order_date_min} — {meta.observed.order_date_max}
                </strong>
                <span>{meta.observed.row_count} imported orders</span>
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
              <span className="state-icon" aria-hidden="true">
                !
              </span>
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
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
