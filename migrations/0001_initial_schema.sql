-- Initial schema: read-only analytics tables, a provenance manifest and a
-- separate durable usage table.
--
-- Money is stored as integer cents so aggregation is exact. Dates are stored as
-- ISO YYYY-MM-DD calendar strings, not timestamps, because the source supplies
-- calendar dates with no time or timezone.
--
-- The llm_usage table is intentionally separate from the analytics tables:
-- reloading orders must never reset consumed quota.

CREATE TABLE orders (
  order_id           TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL,
  order_date         TEXT NOT NULL,
  delivery_date      TEXT,
  carrier            TEXT NOT NULL,
  origin_city        TEXT NOT NULL,
  destination_city   TEXT NOT NULL,
  status             TEXT NOT NULL
    CHECK (status IN ('delivered', 'delayed', 'exception', 'in_transit', 'canceled')),
  sku                TEXT NOT NULL,
  product_category   TEXT NOT NULL,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents   INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  order_value_cents  INTEGER NOT NULL CHECK (order_value_cents >= 0),
  is_promo           INTEGER NOT NULL CHECK (is_promo IN (0, 1)),
  promo_discount_pct REAL NOT NULL CHECK (promo_discount_pct >= 0 AND promo_discount_pct <= 100),
  region             TEXT NOT NULL,
  warehouse          TEXT NOT NULL,
  -- Derived at import from delivery_date - order_date in whole calendar days.
  -- NULL exactly when delivery_date is NULL. Stored so the average delivery
  -- time metric is a plain AVG and needs no engine-specific date arithmetic.
  delivery_days      INTEGER CHECK (delivery_days IS NULL OR delivery_days >= 0)
);

CREATE INDEX idx_orders_order_date ON orders (order_date);
CREATE INDEX idx_orders_delivery_date ON orders (delivery_date);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_sku ON orders (sku);
CREATE INDEX idx_orders_carrier ON orders (carrier);
CREATE INDEX idx_orders_region ON orders (region);
CREATE INDEX idx_orders_category ON orders (product_category);

-- Single-row provenance record written by the importer.
CREATE TABLE data_manifest (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  manifest_json TEXT NOT NULL,
  imported_at   TEXT NOT NULL
);

-- Durable model usage state. One row, updated by a single atomic conditional
-- statement so concurrent requests cannot both claim the last free slot.
CREATE TABLE llm_usage (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  day_key                TEXT NOT NULL,
  day_attempts           INTEGER NOT NULL DEFAULT 0,
  day_tokens_reserved    INTEGER NOT NULL DEFAULT 0,
  month_key              TEXT NOT NULL,
  month_attempts         INTEGER NOT NULL DEFAULT 0,
  next_allowed_at_ms     INTEGER NOT NULL DEFAULT 0,
  updated_at             TEXT NOT NULL
);

-- Seed the singleton so the guard's conditional UPDATE always has a target row.
INSERT INTO llm_usage (id, day_key, month_key, updated_at)
VALUES (1, '', '', '1970-01-01T00:00:00.000Z');
