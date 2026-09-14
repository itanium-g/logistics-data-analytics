# Spaceship frontend redesign

Updated: 2026-09-14 UTC

Status: implemented and locally verified. This is an incremental frontend redesign of the existing Spaceship logistics analytics application. Deployment and live-model evaluation remain outstanding.

## Scope and preserved contracts

The redesign keeps React 19, TypeScript, Vite, ordinary CSS, Geist, the existing indigo/neutral design tokens, Recharts, the local SVG Icon component, System/Light/Dark themes, and reduced-motion CSS behavior. Tailwind, a router, a UI kit, a new chart library, a global store, maps, tracking, authentication and invented operational features were not added.

Dashboard and Forecasts remain the only workspaces. The stateful Dashboard, ForecastPanel and AskPanel controllers remain mounted in the application shell, so navigation and presentation changes do not discard scope, forecast inputs/results, the single assistant draft or the submitted interaction snapshot. Existing endpoints, request payloads, analytical formulas, response contracts, formatters, date interpretations, null handling, forecast assumptions, provider safeguards and evaluation cases were not changed.

The shell translates the useful hierarchy of the TailAdmin free dashboard into Spaceship components:

- a 240px desktop sidebar or 72px rail with only Overview and Forecasts;
- a 64px desktop / 56px mobile header with dataset metadata, theme selection and the AI Analyst trigger;
- a centered workspace with a 1440px content maximum, container-responsive KPI and chart arrangements, and a 400px docked assistant at wide widths;
- a shared native dialog wrapper for mobile navigation and the narrow-screen assistant, with body scroll locking, focus containment, Escape/backdrop dismissal and focus restoration;
- compact filters, readable KPI basis text, contextual evidence disclosures, separated forecast result panels and accessible equivalent tables.

The assistant remains a single-question interaction. Suggested questions only fill the draft, dashboard filters do not scope the question, and retries use the submitted question/context snapshot.

## Tables and CSV

@tanstack/react-table@8.21.3 is the only new direct production dependency. The generic DataTable<T> is presentation-only: it receives already returned rows and never fetches, computes analytical values or imports Worker code. Query and forecast adapters provide the metric formatting, basis/provenance and export context.

Grouped/temporal query evidence and forecast monthly data use native HTML tables backed by TanStack Table v8 row models. Scalar query results retain their simple native table path. Each table:

- starts in server order with no client sort and uses stable response-derived row IDs;
- sorts raw numeric accessors, keeps unavailable values last in either direction, sorts months by raw YYYY-MM, and breaks ties by original response order;
- searches readable labels/keys case-insensitively and combines search with OR-within-facet / AND-between-facet filtering;
- derives facets from returned rows only;
- keeps identifying columns and at least one metric/units column visible;
- uses instance-local visibility, sorting, filtering and pagination state, with a default page size of 25 and options 10/25/50/100;
- resets mounted table state when analytical identity changes, not on ordinary parent rerenders or theme changes. Tables unmount when their workspace is hidden, so table controls are not promised to persist across workspace navigation.

Client table controls operate only on returned rows. Scope evidence remains separate and unchanged:

> Entire analytical scope — unaffected by table filters.

The UI distinguishes source records, returned groups, full matching groups and current-page rows. An empty API response is distinct from returned data with zero local matches. Clearing controls restores the returned-row view without a network request; charts and KPIs are not changed.

Every result table offers CSV for all locally filtered/sorted rows before pagination. The export includes only visible columns plus the mandatory identifier, keeps basis companion columns for query metrics, writes raw fractions/cents/days and unrounded forecast units, and preserves nulls as empty cells with their explanatory basis. It appends one JSON export_context column containing versions, response identity/counts/truncation and the table-view selection. The serializer emits UTF-8 with BOM, CRLF records, correct quote/delimiter/newline/Unicode escaping, deterministic Spaceship filenames, object-URL cleanup and formula-injection protection for string cells without changing genuine numeric values. The UI labels this as a returned-data extract, not a complete evidence report.

## References and licensing

The visual structure was informed by:

- [TailAdmin](https://tailadmin.com/) free React dashboard hierarchy and shell patterns;
- the public [Logistics demonstration](https://tailadmin.com/templates/logistics-dashboard/), used for composition reference only;
- the [TailAdmin free React repository](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard), whose MIT license and free dashboard were used as reference context;
- [TanStack Table v8 documentation](https://tanstack.com/table/latest/docs/introduction).

The Logistics dashboard is a Pro product. No paid source, TailAdmin stylesheet, asset, package manifest, demo data or navigation tree was obtained or copied. The implementation is composed from Spaceship's existing components and tokens, and current source/contracts remain authoritative over the historical OpenDesign reference.

## Files changed

New frontend boundaries:

- src/client/components/AppHeader.tsx
- src/client/components/AppSidebar.tsx
- src/client/components/ModalDialog.tsx
- src/client/components/Panel.tsx
- src/client/features/forecast/ForecastTable.tsx
- src/client/features/table/DataTable.tsx
- src/client/features/table/table-model.ts
- src/client/features/table/csv.ts
- src/client/hooks/useMediaQuery.ts

Updated presentation/shell files:

- src/client/app/App.tsx, src/client/app/Dashboard.tsx, src/client/styles/*.css
- src/client/features/assistant/AskPanel.tsx, features/evidence/*, features/overview/*, features/forecast/*

Verification coverage:

- tests/shell-ui.test.tsx
- tests/data-table.test.tsx
- tests/table-model.test.ts
- tests/csv.test.ts

The domain, data, shared, Worker, migration, manifest, import/seed and hosting/provider systems were not modified for this redesign.

## Verification evidence

Commands run against the completed local implementation:

| Check | Result |
|---|---|
| npm run typecheck | Passed: browser, Worker and test TypeScript projects |
| npm test | Passed: 253 tests in 23 files |
| npm run build | Passed: client bundle, 728.94 kB raw / 210.41 kB gzip |
| npm run smoke | Passed: 13/13 checks against local workerd at http://127.0.0.1:4173 |

The recorded pre-redesign client measurement was 650.27 kB raw / 190.07 kB gzip. The measured change is approximately +78.67 kB raw / +20.34 kB gzip, below the 40 KiB gzip investigation threshold. Vite's large-chunk warning remains visible; it was not silenced.

The smoke command starts the local workerd/static preview and checks HTTP, runtime and SPA/static-serving behavior. It does not inspect rendered chart SVG geometry, replace the browser review, or evaluate a live provider.

The current Chrome DevTools 153.0 review used device scale 1 and the 12 states listed in the [screenshot README](screenshots/README.md). Review included light/dark themes, mobile navigation, modal/docked assistant, filter disclosure, real GLS and forecast responses, evidence search/sort, loaded fonts, stable chart frames and page-level overflow. Tablet assistant Escape dismissal and focus return were verified. Data version is 1.0.0 and metric version is 2.

Reviewed captures live directly in [docs/screenshots](screenshots/README.md), with stable filenames overwritten on refresh. There is no historical gallery or automated pixel-diff suite. See [review limits](screenshots/README.md#review-limits) for the remaining browser-tool limitations.

## Remaining limitations

- The application has not been deployed and no public URL or reviewer access has been verified.
- No live provider call or live routing evaluation has been made. /api/ask remains disabled without a provider key; deterministic tests use a stubbed transport.
- The dataset contains no coordinates, geometries, routes or tracking events, so no geographic view was added.
- Local workerd smoke checks do not establish deployment performance, remote D1 state or live-model quality.
