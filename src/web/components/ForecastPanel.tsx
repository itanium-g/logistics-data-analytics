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
}

/**
 * Direct forecast form. Works without a model provider, which is what keeps the
 * required forecast journey available when natural-language routing is off.
 */
export function ForecastPanel({ meta }: ForecastPanelProps) {
  const listId = useId();
  const [sku, setSku] = useState("CRAYON-0008");
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_MONTHS);
  const [buffer, setBuffer] = useState(DEFAULT_BUFFER_PCT);
  const [result, setResult] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await postForecast({
          scope: "sku",
          sku,
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

  return (
    <section className="panel" aria-labelledby="forecast-heading">
      <h2 id="forecast-heading">SKU demand forecast and inventory target</h2>

      <form className="forecast-form" onSubmit={submit}>
        <label htmlFor="forecast-sku">
          SKU
          <input
            id="forecast-sku"
            list={listId}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={listId}>
            {meta.vocabulary.skus.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>

        <label htmlFor="forecast-horizon">
          Months ahead (1&ndash;{MAX_HORIZON_MONTHS})
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
          Buffer % (0&ndash;{MAX_BUFFER_PCT})
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
          {loading ? "Computing…" : "Forecast demand"}
        </button>
      </form>

      <p className="forecast-hint">
        {meta.vocabulary.sku_count} SKUs are available. History covers{" "}
        {formatIsoDate(meta.assumed_coverage.start)} to {formatIsoDate(meta.assumed_coverage.end)};
        forecasts begin after that window, not from today.
      </p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result !== null && <ForecastResult result={result} />}
    </section>
  );
}
