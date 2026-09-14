import { useId, useRef, useState } from "react";
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
  const skuRef = useRef<HTMLInputElement>(null);
  const horizonRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<HTMLInputElement>(null);
  const [sku, setSku] = useState(() =>
    meta.vocabulary.skus.includes("CRAYON-0008") ? "CRAYON-0008" : (meta.vocabulary.skus[0] ?? ""),
  );
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_MONTHS);
  const [buffer, setBuffer] = useState(DEFAULT_BUFFER_PCT);
  const [result, setResult] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invalid = (message: string, field: React.RefObject<HTMLInputElement | null>): void => {
    setError(message);
    field.current?.focus();
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const normalizedSku = sku.trim();
    if (normalizedSku === "") {
      invalid("Choose a SKU before computing a forecast.", skuRef);
      return;
    }
    if (!meta.vocabulary.skus.includes(normalizedSku)) {
      invalid("Choose a SKU from the published metadata vocabulary.", skuRef);
      return;
    }
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON_MONTHS) {
      invalid(`Months ahead must be a whole number from 1 to ${MAX_HORIZON_MONTHS}.`, horizonRef);
      return;
    }
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > MAX_BUFFER_PCT) {
      invalid(`Buffer must be a whole number from 0 to ${MAX_BUFFER_PCT}%.`, bufferRef);
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
    <section className="forecast-workspace" aria-labelledby="forecast-heading">
      <div className="section-heading forecast-workspace-heading">
        <div>
          <p className="eyebrow">Planning workspace</p>
          <h2 id="forecast-heading">Demand coverage forecast</h2>
        </div>
        <span className="section-meta">1–{MAX_HORIZON_MONTHS} month horizon</span>
      </div>

      <div className="forecast-layout">
        <section className="forecast-config-panel panel" aria-labelledby="forecast-config-heading">
          <div className="section-heading section-heading-compact">
            <div>
              <p className="eyebrow">Configuration</p>
              <h3 id="forecast-config-heading">Set a planning horizon</h3>
            </div>
          </div>
          <p className="panel-note forecast-intro">
            Select a known SKU to repeat its recorded monthly baseline across the requested horizon, then add a visible planning buffer.
          </p>

          <form className="forecast-form" onSubmit={submit} noValidate>
            <label htmlFor="forecast-sku">
              <span>SKU</span>
              <input
                ref={skuRef}
                id="forecast-sku"
                list={listId}
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error !== null && (!meta.vocabulary.skus.includes(sku.trim()) || sku.trim() === "")}
                aria-describedby="forecast-sku-help forecast-validation"
              />
              <datalist id={listId}>
                {meta.vocabulary.skus.map((value) => <option key={value} value={value} />)}
              </datalist>
            </label>

            <label htmlFor="forecast-horizon">
              <span>Months ahead <small>(1–{MAX_HORIZON_MONTHS})</small></span>
              <input
                ref={horizonRef}
                id="forecast-horizon"
                type="number"
                min={1}
                max={MAX_HORIZON_MONTHS}
                step={1}
                value={horizon}
                aria-invalid={error !== null && (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON_MONTHS)}
                aria-describedby="forecast-validation"
                onChange={(event) => setHorizon(Number(event.target.value))}
              />
            </label>

            <label htmlFor="forecast-buffer">
              <span>Buffer <small>(0–{MAX_BUFFER_PCT}%)</small></span>
              <input
                ref={bufferRef}
                id="forecast-buffer"
                type="number"
                min={0}
                max={MAX_BUFFER_PCT}
                step={1}
                value={buffer}
                aria-invalid={error !== null && (!Number.isInteger(buffer) || buffer < 0 || buffer > MAX_BUFFER_PCT)}
                aria-describedby="forecast-validation"
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
            <div id="forecast-validation" className="state-panel state-panel-error inline-state" role="alert">
              <span className="state-icon" aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          )}

          {loading && (
            <div className="forecast-loading" role="status" aria-live="polite">
              <span className="loading-mark" aria-hidden="true" /> Computing the coverage target…
            </div>
          )}
        </section>

        {result !== null && !loading && (
          <div className="forecast-result-column">
            <ForecastResult result={result} />
          </div>
        )}
      </div>
    </section>
  );
}
