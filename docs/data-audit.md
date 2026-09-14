# Supplied dataset audit and analytical assumptions

Source audit: 2026-09-11 UTC. Source: [mock_logistics_data.csv](assignment/README.md#original-files). These original results were independently calculated from all rows using CSV parsing, exact decimal arithmetic and calendar dates. They remain data observations and acceptance fixtures. Current implementation checks are recorded separately in [README verification](../README.md#verification-performed), and the [current screenshots](screenshots/README.md) show selected real API results. This documentation refresh preserves the original analytical findings.

SHA-256: b60f84b18aacc1a76b6d401ba0c290a0efd1f2729734224d65608e941594bc82. Git blob: dc20411f5b37c57af46f2ae42c0802d5a19d0ea9, identical to the earlier pinned reference fixture.

## Structure and quality

| Check | Observed result |
|---|---:|
| Rows / columns / unique order IDs | 400 / 17 / 400 |
| Order dates | 2025-01-01 through 2025-12-30 |
| Latest nonblank delivery date | 2025-12-31 |
| delivered / delayed / exception | 304 / 55 / 11 |
| in_transit / canceled | 27 / 3 |
| Nonblank / missing delivery dates | 370 / 30 |
| Other blank fields | 0 |
| Duplicate order IDs / negative delivery durations | 0 / 0 |
| Raw order value | USD 13,695.87 = 1,369,587 cents |
| Raw value on delayed or exception rows | USD 2,386.10 = 238,610 cents |
| Quantity / non-canceled quantity | 1,310 / 1,303 |
| SKUs / categories / carriers | 355 / 8 / 9 |
| Clients / regions / warehouses | 30 / 5 / 9 |
| SKU row counts | 313 have one row; 39 have two; 3 have three |
| Promo / non-promo rows | 22 / 378 |
| Rows where quantity × unit price differs from order_value_usd | 0 |

All delivered, delayed and exception rows have a delivery date. All in_transit and canceled rows lack it. A date on an exception row does not establish successful or late delivery.

The 17 columns are client_id, order_id, order_date, delivery_date, carrier, origin_city, destination_city, status, sku, product_category, quantity, unit_price_usd, order_value_usd, is_promo, promo_discount_pct, region and warehouse.

Identifiers contain 2026 even though dates are in 2025; do not parse dates from IDs. City fields contain quoted commas. Money is denominated in USD. Raw value equality does not establish net revenue or actual promotion application.

## Monthly controls

| Month | Orders | Non-canceled units |
|---|---:|---:|
| 2025-01 | 75 | 233 |
| 2025-02 | 36 | 86 |
| 2025-03 | 46 | 147 |
| 2025-04 | 25 | 55 |
| 2025-05 | 29 | 115 |
| 2025-06 | 21 | 64 |
| 2025-07 | 42 | 126 |
| 2025-08 | 34 | 98 |
| 2025-09 | 18 | 94 |
| 2025-10 | 26 | 79 |
| 2025-11 | 24 | 113 |
| 2025-12 | 24 | 93 |
| **Total** | **400** | **1,303** |

## Delivery metric version 2

The brief names required KPIs without prescribing formulas. The following definitions are explicit project assumptions. No promised-delivery date, SLA threshold or event history is supplied.

| Metric | Selected definition | Exact control |
|---|---|---|
| On-time delivery rate, status proxy | delivered / (delivered + delayed); exclude unknown exceptions, in_transit and canceled | 304/359 = 84.6796657% |
| Delay rate, status proxy | delayed / (delivered + delayed) | 55/359 = 15.3203343% |
| Average delivery time, delivery-status records | Mean dated delivered/delayed duration | 1,324 days / 359 = 3.6880223 days |
| Delayed orders | status = delayed | 55 |
| Exact SLA compliance | Unavailable | No promised dates or contractual SLA. |

Alternative descriptive facts remain valid: delivered-only duration is 988/304 = 3.25 days; every dated row gives 1,417/370 = 3.8297297 days. The former reference proxies included exceptions, yielding 304/370 = 82.1621622% delivered share and 66/370 = 17.8378378% issue share. They answer different questions and must not appear under v2 labels.

Under v2, GLS has the highest carrier delay share: 2 delayed out of 7 delivered-or-delayed records, or 28.57%. The small denominator must be shown; this does not establish that GLS is causally the worst carrier.

A zero denominator is null/N/A. Compute aggregate percentages from aggregate numerator/denominator, not means of carrier percentages.

## Date-basis controls

In explicit dataset mode the reference date is 2026-01-01. This is a visible demo context, not the current date.

| Scope | Date field | Delayed-status count |
|---|---|---:|
| December 2025 order cohort | order_date | 3 |
| December 2025 delivery events | delivery_date | 4 |
| October–December 2025 order cohort | order_date | 10 |

Therefore “delivered late last month” uses the second row and discloses the status proxy. Combining delivered and delayed as simultaneous status filters is invalid. Current-date mode may honestly return no data in 2026.

## Forecast assumptions and worked fixture

The generated provenance record is `.generated/manifest.json` and is intentionally gitignored because it is derived from the supplied CSV. Its runtime reader is `src/data/manifest.ts`; CSV validation and deterministic seed generation are in `src/data/import.ts` and `src/data/seed-sql.ts`. Analytical query and forecast code consumes these facts through the shared SQL/data contracts, while the Cloudflare-specific adapter remains under `src/server/`.

The recorded period is assumed to cover all of January–December 2025 for this synthetic demo. The last order on December 30 proves neither completeness nor incompleteness. Record assumed bounds separately from observed bounds and return coverage_unverified. Zero-filled months are conditional on that assumption.

Forecast non-canceled quantity. The 355 SKUs are extremely sparse; category-only support would avoid the assignment's SKU example. Instead support known SKUs with a transparent 12-month moving-average baseline, low-history warning, historical/future chart and an inventory target. Do not claim statistical accuracy.

CRAYON-0008 records 3 units on January 14, 3 on January 22 and 1 on April 18. Its monthly series is [6, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]. The sparse baseline is 7/12 units per future month. Four future months total 7/3 units; applying the visible 20% buffer once gives ceil(2.8) = 3 units.

This is a demand-coverage target for January–April 2026, as of December 31, 2025. It is not current September 2026 inventory advice. No stock on hand, inbound supply, lead time, backorders, product launch dates or stockout observations exist. Do not invent net purchases, reorder points, causal explanations, confidence intervals or service-level guarantees.
