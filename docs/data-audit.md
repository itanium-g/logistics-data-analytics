# Dataset facts and analytical assumptions

The application uses the supplied `mock_logistics_data.csv`. The importer validates the input before producing D1 seed data. The source file is intentionally not committed; see [assignment/README.md](assignment/README.md).

## Dataset summary

| Check | Result |
|---|---:|
| Orders / columns / unique order IDs | 400 / 17 / 400 |
| Order-date range | 2025-01-01 to 2025-12-30 |
| Latest delivery date | 2025-12-31 |
| Status counts | 304 delivered, 55 delayed, 27 in transit, 11 exception, 3 canceled |
| Records with / without delivery dates | 370 / 30 |
| Total / non-canceled units | 1,310 / 1,303 |
| SKUs / categories / carriers | 355 / 8 / 9 |
| Clients / regions / warehouses | 30 / 5 / 9 |
| Raw order value | USD 13,695.87 |

The importer also checks the exact 17-column header, duplicate IDs, valid dates, positive integer quantities, exact money arithmetic, and the supplied file SHA-256:

`b60f84b18aacc1a76b6d401ba0c290a0efd1f2729734224d65608e941594bc82`

## Metric definitions

| Metric | Definition |
|---|---|
| Total orders | Count of orders in the selected scope. |
| Delivered orders | Rows with `status = delivered`. |
| Delayed orders | Rows with `status = delayed`. |
| On-time delivery rate | `delivered / (delivered + delayed)`; labelled a status proxy. |
| Average delivery time | Mean calendar days for dated delivered or delayed records. |

Whole-dataset reference values are 400 total orders, 304 delivered, 55 delayed, **84.68%** on-time status proxy (`304/359`), and **3.69 days** average delivery time (`1,324/359`).

## Assumptions

- The data contains no promised delivery date or SLA threshold, so exact SLA compliance cannot be calculated.
- Exceptions, in-transit rows, and canceled rows are not treated as successful or late deliveries in the rate denominator.
- Order-cohort questions use `order_date`; delivery-event questions use `delivery_date`.
- The synthetic 2025 data is treated as the forecast coverage window. Forecasts are labelled as of 2025-12-31 and do not claim to be current 2026 advice.
- Forecasts use non-canceled quantity for a known SKU. The sparse-history baseline is transparent and illustrative; no accuracy, confidence interval, or seasonality claim is made.
- The forecast coverage target is buffered demand over the selected horizon. It is not a net purchase quantity, reorder point, or safety-stock guarantee because stock, inbound supply, lead time, and backorders are absent.
