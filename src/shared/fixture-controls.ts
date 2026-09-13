/**
 * Control totals for the supplied fixture, transcribed from docs/data-audit.md.
 *
 * These are asserted only when the input file's checksum matches the supplied
 * CSV. A replacement dataset must never have these values forced onto it.
 */
export const SUPPLIED_FIXTURE_CONTROLS = {
  rowCount: 400,
  uniqueOrderIds: 400,
  columnCount: 17,
  observedOrderDateMin: "2025-01-01",
  observedOrderDateMax: "2025-12-30",
  observedDeliveryDateMax: "2025-12-31",
  statusCounts: {
    delivered: 304,
    delayed: 55,
    exception: 11,
    in_transit: 27,
    canceled: 3,
  },
  datedDeliveryCount: 370,
  missingDeliveryDateCount: 30,
  totalQuantity: 1310,
  nonCanceledQuantity: 1303,
  rawOrderValueCents: 1_369_587,
  delayedOrExceptionValueCents: 238_610,
  /** delivered + delayed */
  deliveryOutcomeCount: 359,
  /** Sum of delivery_days over delivered + delayed rows. */
  deliveryOutcomeDaysTotal: 1324,
  /** Sum over delivered rows only. */
  deliveredOnlyDaysTotal: 988,
  /** Sum over every dated row, including exceptions. */
  allDatedDaysTotal: 1417,
  promoRowCount: 22,
  valueMismatchCount: 0,
  negativeDurationCount: 0,
  distinctSkus: 355,
  distinctCategories: 8,
  distinctCarriers: 9,
  distinctClients: 30,
  distinctRegions: 5,
  distinctWarehouses: 9,
  /** SKUs appearing once / twice / three times. */
  skuRowCountBuckets: { "1": 313, "2": 39, "3": 3 },
  monthly: [
    { month: "2025-01", orders: 75, nonCanceledUnits: 233 },
    { month: "2025-02", orders: 36, nonCanceledUnits: 86 },
    { month: "2025-03", orders: 46, nonCanceledUnits: 147 },
    { month: "2025-04", orders: 25, nonCanceledUnits: 55 },
    { month: "2025-05", orders: 29, nonCanceledUnits: 115 },
    { month: "2025-06", orders: 21, nonCanceledUnits: 64 },
    { month: "2025-07", orders: 42, nonCanceledUnits: 126 },
    { month: "2025-08", orders: 34, nonCanceledUnits: 98 },
    { month: "2025-09", orders: 18, nonCanceledUnits: 94 },
    { month: "2025-10", orders: 26, nonCanceledUnits: 79 },
    { month: "2025-11", orders: 24, nonCanceledUnits: 113 },
    { month: "2025-12", orders: 24, nonCanceledUnits: 93 },
  ],
} as const;
