import { useEffect, useState } from "react";
import type { MetaResponse } from "../shared/contracts.ts";
import { ApiError, fetchMeta } from "./api.ts";
import { Dashboard } from "./Dashboard.tsx";
import { AskPanel } from "./components/AskPanel.tsx";
import { ForecastPanel } from "./components/ForecastPanel.tsx";

type MetaState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly meta: MetaResponse }
  | { readonly kind: "error"; readonly message: string; readonly hint: string | null };

export function App() {
  const [state, setState] = useState<MetaState>({ kind: "loading" });

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

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Spaceship Logistics Analytics</h1>
          <p className="app-subtitle">
            Deterministic analytics over a supplied 400-order synthetic dataset. Every value is
            computed from the imported records, with its definition and scope shown alongside.
          </p>
        </div>
        {state.kind === "ready" && (
          <p className="app-version">
            data {state.meta.data_version} · metric v{state.meta.metric_version} ·{" "}
            {state.meta.observed.row_count} orders
          </p>
        )}
      </header>

      <main className="app-main">
        {state.kind === "loading" && (
          <p className="panel" role="status">
            Loading the metric contract…
          </p>
        )}

        {state.kind === "error" && (
          <div className="panel" role="alert">
            <h2>Analytics unavailable</h2>
            <p className="error">{state.message}</p>
            {state.hint !== null && <p className="hint">{state.hint}</p>}
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <Dashboard meta={state.meta} />
            <AskPanel meta={state.meta} />
            <ForecastPanel meta={state.meta} />
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>
          On-time and delay rates use explicit status proxies: the dataset supplies no promised
          delivery date or SLA threshold, so exact SLA compliance cannot be measured. Exception
          records are reported separately from delayed records.
        </p>
      </footer>
    </div>
  );
}
