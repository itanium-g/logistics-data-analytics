import { useState } from "react";
import type { AskResponse, DateContext, MetaResponse } from "../../shared/contracts.ts";
import { MAX_QUESTION_CHARS } from "../../shared/contracts.ts";
import { ApiError, postAsk } from "../api.ts";
import { EvidencePanel } from "./EvidencePanel.tsx";
import { ForecastResult } from "./ForecastResult.tsx";
import { ResultChart } from "./ResultChart.tsx";

const EXAMPLES = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "Predict demand for SKU CRAYON-0008 for the next 4 months",
] as const;

interface AskState {
  readonly kind: "idle" | "loading";
}

interface AskPanelProps {
  readonly meta: MetaResponse;
}

/**
 * Natural-language routing. The model chooses one operation; every number shown
 * here is computed by the application and rendered from result fields. The plan
 * panel exposes the validated interpretation, not model reasoning.
 */
export function AskPanel({ meta }: AskPanelProps) {
  const [question, setQuestion] = useState<string>(EXAMPLES[0]);
  const [dateContext, setDateContext] = useState<DateContext>("dataset");
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<{ message: string; unavailable: boolean } | null>(null);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setState({ kind: "loading" });
    setError(null);
    void (async () => {
      try {
        const result = await postAsk({ question, date_context: dateContext });
        setAnswer(result);
      } catch (caught) {
        setAnswer(null);
        const unavailable = caught instanceof ApiError && caught.code === "provider_disabled";
        setError({
          message:
            caught instanceof ApiError
              ? caught.message
              : "The question could not be answered. Try again.",
          unavailable,
        });
      } finally {
        setState({ kind: "idle" });
      }
    })();
  };

  return (
    <section className="panel" aria-labelledby="ask-heading">
      <h2 id="ask-heading">Ask a question</h2>
      <p className="panel-note">
        A model selects one operation from a fixed contract. The application computes every value
        and writes the answer, so no number here is generated text.
      </p>

      <form className="ask-form" onSubmit={submit}>
        <label htmlFor="ask-question">
          Question
          <textarea
            id="ask-question"
            value={question}
            maxLength={MAX_QUESTION_CHARS}
            rows={2}
            onChange={(event) => setQuestion(event.target.value)}
            required
          />
        </label>

        <label htmlFor="ask-context">
          Date context
          <select
            id="ask-context"
            value={dateContext}
            onChange={(event) => setDateContext(event.target.value as DateContext)}
          >
            <option value="dataset">
              Dataset mode (reference {meta.dataset_reference_date})
            </option>
            <option value="current">Current mode (today, UTC)</option>
          </select>
        </label>

        <button type="submit" className="primary-button" disabled={state.kind === "loading"}>
          {state.kind === "loading" ? "Routing…" : "Ask"}
        </button>
      </form>

      <ul className="ask-examples">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button type="button" className="link-button" onClick={() => setQuestion(example)}>
              {example}
            </button>
          </li>
        ))}
      </ul>

      {error !== null && (
        <div className={error.unavailable ? "ask-unavailable" : "error"} role="alert">
          <p>{error.message}</p>
          {error.unavailable && (
            <p className="hint">
              To enable it locally: set GROQ_API_KEY in .dev.vars and LLM_ENABLED to true in
              wrangler.jsonc. The dashboard and the SKU forecast above need no provider.
            </p>
          )}
        </div>
      )}

      {answer !== null && (
        <div className="ask-answer">
          <p className="ask-answer-text" role="status">
            {answer.answer}
          </p>

          <dl className="evidence-list">
            <dt>Operation selected</dt>
            <dd>{answer.tool}</dd>
            <dt>Interpretation</dt>
            <dd>{answer.interpretation.summary}</dd>
            <dt>Router</dt>
            <dd>
              {answer.provider.name} {answer.provider.model}, about{" "}
              {answer.usage.input_tokens_estimated} input tokens, output capped at{" "}
              {answer.usage.max_output_tokens}
            </dd>
          </dl>

          {answer.clarification !== null && (
            <p className="panel-note">
              Missing detail: {answer.clarification.missing}. Nothing was assumed and no operation
              ran.
            </p>
          )}

          {answer.unsupported !== null && (
            <p className="panel-note">Closest supported question: {answer.unsupported.alternative}</p>
          )}

          {answer.query !== null && (
            <>
              <ResultChart result={answer.query} title={question} />
              <EvidencePanel
                result={answer.query}
                tableCaption="Underlying rows for this answer"
                defaultOpen
              />
            </>
          )}

          {answer.forecast !== null && <ForecastResult result={answer.forecast} />}
        </div>
      )}
    </section>
  );
}
