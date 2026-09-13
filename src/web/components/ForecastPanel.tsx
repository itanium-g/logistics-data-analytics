import { useId, useState } from "react";
import { formatIsoDate } from "../../domain/format.ts";
import {
  DEFAULT_BUFFER_PCT,
  DEFAULT_HORIZON_MONTHS,
  MAX_BUFFER_PCT,
  MAX_HORIZON_MONTHS,
  type ForecastResponse,
  type MetaResponse,
} from "../../shared/contracts.ts";
import { ApiError, postForecast } from "../api.ts";
import { ForecastResult } from "./ForecastResult.tsx";

interface ForecastPanelProps {
  readonly meta: MetaResponse;
  /** The component stays mounted while Overview is active, preserving the form and result. */
  readonly active?: boolean;
}

/** Direct forecast form. It works without a model provider. */
export function ForecastPanel({ meta, active = true }: ForecastPanelProps) {
  const listId = `forecast-sku-list-${useId().replaceAll(":", "")}`;
  const [sku, setSku] = useState(() =>
    meta.vocabulary.skus.includes("CRAYON-0008") ? "CRAYON-0008" : (meta.vocabulary.skus[0] ?? ""),
  );
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_MONTHS);
  const [buffer, setBuffer] = useState(DEFAULT_BUFFER_PCT);
  const [result, setResult] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const normalizedSku = sku.trim();
    if (normalizedSku === "") {
      setError("Choose a SKU before computing a forecast.");
      return;
    }
    if (!meta.vocabulary.skus.includes(normalizedSku)) {
      setError("Choose a SKU from the published metadata vocabulary.");
      return;
    }
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON_MONTHS) {
      setError(`Months ahead must be a whole number from 1 to ${MAX_HORIZON_MONTHS}.`);
      return;
    }
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > MAX_BUFFER_PCT) {
      setError(`Buffer must be a whole number from 0 to ${MAX_BUFFER_PCT}%.`);
      return;
    }

    setSku(normalizedSku);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await postForecast({
          scope: "sku",
          sku: normalizedSku,
          horizon_months: horizon,
          buffer_pct: buffer,
        });
        setResult(next);
      } catch (caught) {
        setResult(null);
        setError(
          caught instanceof ApiError
            ? caught.message
            : "The forecast could not be computed. Try again.",
        );
      } finally {
        setLoading(false);
      }
    })();
  };

  if (!active) return null;

  return (
    <section className="forecast-workspace panel" aria-labelledby="forecast-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Planning workspace</p>
          <h2 id="forecast-heading">Demand coverage forecast</h2>
        </div>
        <span className="section-meta">1–{MAX_HORIZON_MONTHS} month horizon</span>
      </div>
      <p className="panel-note forecast-intro">
        Select a known SKU to repeat its recorded monthly baseline across the requested horizon, then add a visible planning buffer.
      </p>

      <form className="forecast-form" onSubmit={submit}>
        <label htmlFor="forecast-sku">
          <span>SKU</span>
          <input
            id="forecast-sku"
            list={listId}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby="forecast-sku-help"
          />
          <datalist id={listId}>
            {meta.vocabulary.skus.map((value) => <option key={value} value={value} />)}
          </datalist>
        </label>

        <label htmlFor="forecast-horizon">
          <span>Months ahead <small>(1–{MAX_HORIZON_MONTHS})</small></span>
          <input
            id="forecast-horizon"
            type="number"
            min={1}
            max={MAX_HORIZON_MONTHS}
            step={1}
            value={horizon}
            onChange={(event) => setHorizon(Number(event.target.value))}
          />
        </label>

        <label htmlFor="forecast-buffer">
          <span>Buffer <small>(0–{MAX_BUFFER_PCT}%)</small></span>
          <input
            id="forecast-buffer"
            type="number"
            min={0}
            max={MAX_BUFFER_PCT}
            step={1}
            value={buffer}
            onChange={(event) => setBuffer(Number(event.target.value))}
          />
        </label>

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Computing…" : "Run forecast"}
        </button>
      </form>

      <p className="forecast-hint" id="forecast-sku-help">
        {meta.vocabulary.sku_count} SKUs available. History covers {formatIsoDate(meta.assumed_coverage.start)} to {formatIsoDate(meta.assumed_coverage.end)}; forecasts begin after that window, not from today.
      </p>

      {error !== null && (
        <div className="state-panel state-panel-error inline-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="forecast-loading" role="status" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" /> Computing the coverage target…
        </div>
      )}

      {result !== null && !loading && <ForecastResult result={result} />}
    </section>
  );
}
