import { useEffect, useRef, useState, type RefObject } from "react";
import type { AskResponse, DateContext, MetaResponse } from "../../../shared/contracts.ts";
import { MAX_QUESTION_CHARS } from "../../../shared/contracts.ts";
import { ApiError, postAsk } from "../../lib/api.ts";
import { EvidencePanel } from "../evidence/EvidencePanel.tsx";
import { ForecastResult } from "../forecast/ForecastResult.tsx";
import { Icon } from "../../components/Icons.tsx";
import { ModalDialog } from "../../components/ModalDialog.tsx";
import { ResultChart } from "../evidence/ResultChart.tsx";

const EXAMPLES = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "Predict demand for SKU CRAYON-0008 for the next 4 months",
] as const;

type AskInteraction =
  | {
      readonly kind: "loading";
      readonly question: string;
      readonly dateContext: DateContext;
    }
  | {
      readonly kind: "success";
      readonly question: string;
      readonly dateContext: DateContext;
      readonly response: AskResponse;
    }
  | {
      readonly kind: "error";
      readonly question: string;
      readonly dateContext: DateContext;
      readonly code: ApiError["code"];
      readonly message: string;
      readonly details: readonly string[];
      readonly retryAfterSeconds?: number;
    };

interface AskPanelProps {
  readonly meta: MetaResponse;
  readonly open: boolean;
  readonly modal: boolean;
  readonly onClose: () => void;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function friendlyErrorTitle(code: ApiError["code"]): string {
  switch (code) {
    case "provider_disabled":
      return "AI Analyst is not configured";
    case "rate_limited":
      return "The question limit has been reached";
    case "provider_account_quota":
      return "The AI daily allocation has been reached";
    case "provider_rate_limited":
    case "provider_capacity":
      return "The AI provider is busy";
    case "provider_invalid_response":
      return "The analyst could not interpret the question";
    case "provider_rejected":
      return "The AI provider could not accept the request";
    case "provider_timeout":
      return "The analyst timed out";
    case "provider_outage":
      return "The analyst is temporarily unavailable";
    case "network_error":
      return "Connection failed";
    default:
      return "The question could not be answered";
  }
}

/**
 * Natural-language routing. The model chooses one operation; every number shown
 * here is computed by the application and rendered from result fields. The
 * submitted question and date context travel with the result so editing the next
 * draft cannot relabel an earlier answer.
 */
export function AskPanel({ meta, open, modal, onClose, triggerRef }: AskPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  const requestNumber = useRef(0);
  const [draft, setDraft] = useState("");
  const [dateContext, setDateContext] = useState<DateContext>("dataset");
  const [interaction, setInteraction] = useState<AskInteraction | null>(null);

  useEffect(() => {
    let frame: number | undefined;
    if (open && !wasOpen.current) {
      const focus = (): void => closeRef.current?.focus();
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        frame = window.requestAnimationFrame(focus);
      } else {
        focus();
      }
    }
    if (!open && wasOpen.current) triggerRef?.current?.focus();
    wasOpen.current = open;

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [open, triggerRef]);

  const submitQuestion = (submittedQuestion: string, submittedContext: DateContext): void => {
    const currentRequest = requestNumber.current + 1;
    requestNumber.current = currentRequest;
    setInteraction({ kind: "loading", question: submittedQuestion, dateContext: submittedContext });

    void (async () => {
      try {
        const response = await postAsk({ question: submittedQuestion, date_context: submittedContext });
        if (requestNumber.current !== currentRequest) return;
        setInteraction({ kind: "success", question: submittedQuestion, dateContext: submittedContext, response });
      } catch (caught) {
        if (requestNumber.current !== currentRequest) return;
        const apiError = caught instanceof ApiError ? caught : null;
        setInteraction({
          kind: "error",
          question: submittedQuestion,
          dateContext: submittedContext,
          code: apiError?.code ?? "network_error",
          message: apiError?.message ?? "The question could not be answered. Try again.",
          details: apiError?.details.map((detail) => detail.message) ?? [],
          retryAfterSeconds: apiError?.retryAfterSeconds,
        });
      }
    })();
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const submittedQuestion = draft.trim();
    if (submittedQuestion === "" || interaction?.kind === "loading") return;
    submitQuestion(submittedQuestion, dateContext);
  };

  const onQuestionKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && !modal) {
      event.preventDefault();
      onClose();
      return;
    }
    if (!modal || event.key !== "Tab") return;
    const elements = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])];
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const busy = interaction?.kind === "loading";
  const hasDraft = draft.trim().length > 0;

  const panel = (
    <aside
      ref={panelRef}
      id="ai-analyst-panel"
      className={`assistant-panel${modal ? " assistant-panel-modal" : " assistant-panel-docked"}`}
      role={modal ? undefined : "complementary"}
      aria-label={modal ? undefined : "AI Analyst"}
      onKeyDown={onPanelKeyDown}
    >
        <div className="assistant-header">
          <div className="assistant-title-row">
            <span className="assistant-mark" aria-hidden="true"><Icon name="spark" size={16} /></span>
            <div>
              <p className="eyebrow">Workspace copilot</p>
              <h2 id="assistant-heading">AI Analyst</h2>
            </div>
          </div>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close AI Analyst">
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="assistant-scroll">
          <p className="assistant-intro">
            Ask about the supplied order data or request a known-SKU demand forecast. The application computes the numbers and shows its evidence.
          </p>

          <form className="ask-form" onSubmit={submit}>
            <label htmlFor="ask-question">
              <span className="form-label-row"><span>Question</span><span className="character-count">{draft.length}/{MAX_QUESTION_CHARS}</span></span>
              <textarea
                id="ask-question"
                value={draft}
                maxLength={MAX_QUESTION_CHARS}
                rows={4}
                placeholder="e.g. Which carrier has the highest delay rate?"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onQuestionKeyDown}
                aria-describedby="ask-question-help"
              />
            </label>
            <p id="ask-question-help" className="field-help">Use Ctrl+Enter or Cmd+Enter to submit. Enter adds a new line.</p>

            <label htmlFor="ask-context">
              <span>Date context</span>
              <select
                id="ask-context"
                value={dateContext}
                onChange={(event) => setDateContext(event.target.value as DateContext)}
              >
                <option value="dataset">Dataset mode · reference {meta.dataset_reference_date}</option>
                <option value="current">Current mode · today, UTC</option>
              </select>
            </label>

            <button type="submit" className="primary-button ask-submit" disabled={!hasDraft || busy}>
              <Icon name="arrow" size={15} />
              {busy ? "Analyzing…" : "Ask analyst"}
            </button>
          </form>

          <div className="suggested-prompts">
            <div className="suggested-heading"><span>Try a supported question</span><span className="section-meta">No auto-submit</span></div>
            <div className="prompt-list">
              {EXAMPLES.map((example) => (
                <button type="button" className="prompt-chip" key={example} onClick={() => setDraft(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>

          {interaction === null && (
            <div className="assistant-empty" role="status">
              <span className="empty-state-mark" aria-hidden="true"><Icon name="activity" size={18} /></span>
              <div>
                <strong>Ready for a question</strong>
                <p>Start with a prompt above. Your dashboard filters stay separate from this question.</p>
              </div>
            </div>
          )}

          {interaction?.kind === "loading" && (
            <div className="assistant-result" role="status" aria-live="polite">
              <div className="submitted-question"><span>Submitted question</span><strong>{interaction.question}</strong></div>
              <p className="interaction-context">{interaction.dateContext === "dataset" ? "Dataset date context" : "Current UTC date context"}</p>
              <div className="assistant-thinking"><span className="loading-mark" aria-hidden="true" /> Routing to a supported operation…</div>
            </div>
          )}

          {interaction?.kind === "error" && (
            <div className={`assistant-error${interaction.code === "provider_disabled" ? " assistant-error-neutral" : ""}`} role="alert">
              <div className="assistant-error-heading"><span className="state-icon" aria-hidden="true">!</span><strong>{friendlyErrorTitle(interaction.code)}</strong></div>
              <p>{interaction.message}</p>
              {interaction.retryAfterSeconds !== undefined && <p className="field-help">Try again in about {interaction.retryAfterSeconds} seconds.</p>}
              {interaction.details.length > 0 && <ul className="error-details">{interaction.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
              <button type="button" className="secondary-button" onClick={() => submitQuestion(interaction.question, interaction.dateContext)}>Retry question</button>
              <details className="diagnostics">
                <summary>Error details</summary>
                <dl className="evidence-list"><dt>Code</dt><dd>{interaction.code}</dd><dt>Submitted date context</dt><dd>{interaction.dateContext}</dd></dl>
              </details>
            </div>
          )}

          {interaction?.kind === "success" && (
            <div className="assistant-result">
              <div className="submitted-question"><span>Submitted question</span><strong>{interaction.question}</strong></div>
              <p className="interaction-context">{interaction.dateContext === "dataset" ? "Dataset date context" : "Current UTC date context"}</p>
              <div className="answer-block">
                <p className="answer-label">{interaction.response.query || interaction.response.forecast ? "Computed answer" : "Analyst response"}</p>
                <p className="ask-answer-text" role="status" aria-live="polite">{interaction.response.answer}</p>
              </div>

              {interaction.response.clarification !== null && (
                <div className="response-callout"><strong>Clarification requested</strong><p>{interaction.response.clarification.question}</p><span>Missing detail: {interaction.response.clarification.missing}</span></div>
              )}
              {interaction.response.unsupported !== null && (
                <div className="response-callout"><strong>Closest supported question</strong><p>{interaction.response.unsupported.alternative}</p><span>{interaction.response.unsupported.reason}</span></div>
              )}

              <details className="diagnostics">
                <summary>Router diagnostics</summary>
                <dl className="evidence-list">
                  <dt>Operation</dt><dd>{interaction.response.tool}</dd>
                  <dt>Interpretation</dt><dd>{interaction.response.interpretation.summary}</dd>
                  <dt>Provider / model</dt><dd>{interaction.response.provider.name} · {interaction.response.provider.model}</dd>
                  <dt>Token estimate</dt><dd>{interaction.response.usage.input_tokens_estimated} input · {interaction.response.usage.max_output_tokens} output cap</dd>
                </dl>
              </details>

              {interaction.response.query !== null && (
                <div className="assistant-evidence">
                  <ResultChart result={interaction.response.query} title={interaction.question} />
                  <EvidencePanel result={interaction.response.query} tableCaption="Underlying rows for this answer" defaultOpen evidenceLabel="Answer evidence" />
                </div>
              )}
              {interaction.response.forecast !== null && <ForecastResult result={interaction.response.forecast} />}
            </div>
          )}
        </div>
    </aside>
  );

  if (!modal && !open) return null;
  if (!modal) return panel;

  return (
    <ModalDialog
      open={open}
      headingId="assistant-heading"
      initialFocusRef={closeRef}
      returnFocusRef={triggerRef}
      onDismiss={onClose}
      className="assistant-dialog"
    >
      {panel}
    </ModalDialog>
  );
}

export { EXAMPLES };
