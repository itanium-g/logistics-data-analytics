# AI assistance disclosure

Updated: 2026-09-13 UTC. This repository now contains a working application in addition to the earlier planning and research documents.

## Work recorded so far

| Stage | Assistance | Scope and verification |
|---|---|---|
| Earlier research and planning | ChatGPT-assisted research and architecture comparison | Produced the retained report, implementation plan and hosting/LLM comparison. Their research claims are distinguished from application evidence throughout. |
| Earlier local document refactor | User-reported Kiro assistance | The user reported a local refactor. Exact model identity and per-file history were not independently verified; no vendor model name is asserted. |
| Assignment reconciliation | ChatGPT/Codex assistance | Read the supplied DOCX/PDF/CSV, revised requirements, data assumptions, timebox, SKU forecast scope and submission checklist. |
| Data verification | Deterministic CSV/decimal/date calculations | Checked all 400 records, byte hashes, counts, sums, dates, sparsity and the worked forecast arithmetic. These were source-data checks, not application tests. |
| **Implementation** | **Kiro CLI (claude-opus-5) drove the build in this session** | Scaffolded the project, wrote every source file under `src/`, `scripts/`, `migrations/` and `tests/`, and updated this documentation. Work proceeded through eight reviewed steps, each ending with typecheck, tests, build and a runtime smoke run before moving on. |
| **Structure follow-up** | **Codex assistance with codebase-memory MCP** | Read the indexed code graph, moved data/bootstrap concerns into `src/data/`, separated the shared SQL port from the Worker D1 adapter, audited `.gitignore`, updated path documentation, and reran typecheck plus the full test suite. |

| UI redesign follow-up | OpenDesign reference generation and Codex assistance | Applied the responsive Overview and Forecasts workspaces, theme selector, AI Analyst states, accessible evidence surfaces and chart styling while preserving the existing API contracts. Verified with the focused UI tests, the full suite, production checks and local Chrome DevTools review; representative captures are checked in under docs/screenshots/. |

### What the assistant did in the implementation session

- Resolved and pinned exact dependency versions after querying the registry, and recorded the two deviations from the plan's targets in the README rather than silently accepting them.
- Wrote the importer, schema, metric registry, date interpretation, bounded query compiler, forecast, decision validation, prompt builder, answer renderer, quota guard, provider adapter, Hono routes, React UI and the whole test suite.
- Wrote and ran the checks: 206 tests in 13 files, three TypeScript projects, the production build, and a 13-check runtime smoke harness against workerd.
- Read the repository with the codebase-memory MCP graph before the structure follow-up; the graph was refreshed after the moves and reported no partial or skipped source files.

### Defects the checks caught, and what changed

These are recorded because they show what the verification actually did, rather than implying the first draft was correct:

1. `runForecast` computed its `warnings` array and then omitted it from the returned object. A test dereferenced `warnings` and failed. The cause was writing the module without running `typecheck` immediately afterwards; the practice changed to typechecking each new module on completion.
2. `tsconfig.worker.json` was silently typechecking the JSX component tests without JSX or DOM libraries. A third TypeScript project was added for them.
3. A filtered-by-status query disclosed no assumptions, because `total_orders` carries none, even though the answer's meaning depends on the status proxy. Assumption collection now considers the plan, not only the metrics, and discloses the proxy whenever status is filtered or grouped.
4. The seed builder rejected the pretty-printed manifest because its value guard forbids newlines in data values. The builder now normalizes manifest JSON, and the guard was kept.

## What has not been done

No deployment, no infrastructure provisioning, no live model call and no employer submission occurred. `/api/ask` ships disabled: there is no provider key in this repository, and the routing tests substitute the HTTP transport rather than contacting a provider. The 20 frozen cases in `evals/cases.json` have not been executed, so no claim is made about live routing accuracy.

The supplied files were read without modification and are not committed. No reference implementation code was copied. The runtime model that the application would call is a separate matter from the assistant used to write the code.

## Responsibility

Every number quoted in the README and in the test suite is reproducible by running the commands listed there. Where something is unverified — deployment behaviour, free-tier CPU fit, live routing quality — it is labelled unverified rather than estimated.

Source: Coding_assignment.docx §15 and logistics-spec.pdf p3 warn that undisclosed AI usage may be treated negatively.
