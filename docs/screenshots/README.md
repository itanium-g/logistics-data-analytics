# Current UI screenshots

These 12 captures are the current local application, taken with Chrome DevTools MCP from http://localhost:5173/ using real analytical responses. They are not mockups. This directory is the single location for the checked-in UI captures; future refreshes overwrite these filenames. Superseded images and historical galleries are removed. The production UI was separately reviewed at the required widths and states, but the screenshot MCP file-save whitelist rejected repository paths, so these stable PNGs remain the local capture set.

## Capture conditions

Chrome 153.0 on Windows, device scale factor 1, browser zoom 100%, explicit Light or Dark theme, no network or CPU throttling. Viewports below are CSS pixels using desktop-browser responsive emulation, including the mobile-sized states; these are not physical-device checks. Data version 1.0.0 and metric version 2 were loaded from the local API. Dataset mode anchors relative dates to 2026-01-01, using all available order dates unless stated otherwise.

Before each capture the expected response was present, loading indicators were clear, document.fonts.ready had resolved, and chart container dimensions were unchanged across consecutive animation frames. Each resulting image was visually inspected for theme, readable labels, layout, expected values and clipping. Page-level horizontal overflow was absent in these captured states. Some pages and modal/table regions scroll vertically; a viewport capture intentionally does not show all content below the fold. Chart axis ticks are responsive and may omit intermediate labels; equivalent data remains in the tables.

Direct Overview and Forecasts responses came from the analytical API. Assistant captures show the ready state with no submitted question; no model result is fabricated and no provider call was made for the checked-in captures. Deployment and production browser validation were performed separately; the full live-model evaluation remains unrun.

## Captures

| Capture | Viewport | Framing and state |
|---|---|---|
| [overview-light-desktop.png](overview-light-desktop.png) | 1920 × 1600 | Viewport at top showing the whole page; light, expanded sidebar, assistant closed, default scope, all five KPIs and both charts. |
| [overview-dark-desktop.png](overview-dark-desktop.png) | 1920 × 1600 | Viewport at top showing the whole page; dark equivalent of the default Overview. |
| [overview-dark-docked.png](overview-dark-docked.png) | 1280 × 1100 | Viewport at top; dark, forced 72px navigation rail and 400px docked assistant in ready state. |
| [overview-light-docked.png](overview-light-docked.png) | 1536 × 1100 | Viewport at top; light, expanded 240px sidebar and 400px docked assistant. |
| [overview-light-mobile.png](overview-light-mobile.png) | 390 × 844 | Viewport at top; compact header, collapsed filters, default scope and first KPI row. |
| [overview-dark-mobile-filters.png](overview-dark-mobile-filters.png) | 360 × 844 | Viewport at top; expanded Filters, dark theme. Remaining fields are below the fold. |
| [navigation-light-mobile.png](navigation-light-mobile.png) | 390 × 844 | Viewport; native navigation dialog open, Overview selected, close control focused. Dataset footer is scrollable. |
| [assistant-light-tablet.png](assistant-light-tablet.png) | 768 × 1024 | Viewport; 480px light assistant modal in ready state with dimmed workspace and internal scrolling. |
| [forecast-light-desktop.png](forecast-light-desktop.png) | 1280 × 1600 | Viewport at top; CRAYON-0008, four months, 20% buffer; form, 3-unit target, supporting values and chart. |
| [forecast-dark-mobile.png](forecast-dark-mobile.png) | 390 × 844 | Viewport scrolled to forecast target and supporting values; same computed result in dark theme. |
| [overview-gls-light-desktop.png](overview-gls-light-desktop.png) | 1280 × 1100 | Viewport at top; carrier GLS applied through the real filter control, assistant closed. |
| [evidence-table-dark-desktop.png](evidence-table-dark-desktop.png) | 1440 × 1100 | Viewport scrolled to expanded Monthly volume evidence; search 2025-0, Total orders ascending, default 25-row page size. Table has its own vertical scroll region. |

## Analytical checks

- Default Overview: 400 total, 304 delivered, 55 delayed, 84.68% on-time status proxy (304/359), 3.69 days (359 eligible records).
- Monthly order counts: 75, 36, 46, 25, 29, 21, 42, 34, 18, 26, 24, 24; total 400. Status counts: 304 delivered, 55 delayed, 27 in transit, 11 exception, 3 canceled.
- GLS: 9 total, 5 delivered, 2 delayed, 71.43% (5/7), 4.43 days (7 eligible records). This scope differs from the carrier-ranking question, whose GLS delay rate is 28.57% (2/7).
- CRAYON-0008: January–April 2026 at 7/12 units each, baseline 7/3, visible 20% buffer, rounded coverage target 3 units, as of 2025-12-31, coverage_unverified. The UI rounds supporting display values; exports retain raw response values.
- Evidence search matches January–September 2025: nine of the twelve returned groups. Ascending counts are 18, 21, 25, 29, 34, 36, 42, 46, 75. Whole-scope evidence remains 400 source records and 12 of 12 API groups; local table controls do not change the analytical scope.

See the original [data audit](../data-audit.md), [frontend table/CSV contract](../frontend-redesign.md#tables-and-csv) and [verification commands](../../README.md#verification-performed).

## Review limits

- At 1440 × 1100 with the assistant docked, the forecast configuration and result now stack within the reduced workspace. The container-query fix is checked in `src/client/styles/forecast.css`; no page-level horizontal overflow is expected.
- Tablet assistant Escape dismissal and focus restoration to the assistant trigger were checked. These captures do not establish an exhaustive keyboard, screen-reader, backdrop-dismissal or focus-transition audit.
- The enabled DevTools surface exposes color-scheme and viewport emulation but no reduced-motion or browser-zoom control. Reduced-motion media emulation and a full 200% browser-zoom audit remain pending. Reading CSS or shrinking a viewport does not establish either check.
- System-theme transition review, a complete breakpoint sweep, real-device checks, deployed-browser checks and automated pixel-diff coverage are not claimed by this refresh.
- Production API and browser validation is complete: the public Worker served the expected data and layouts at 390, 768, 1280, 1440 and 1920px, with no page-level horizontal overflow or console errors observed. The screenshot files themselves remain local because repository-path capture writes were blocked. The full live-model evaluation and external reviewer/employer handoff remain outside this catalog.
