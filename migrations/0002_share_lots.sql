-- A "lot" is one batch of shares you acquired, with what you paid and what they were worth on the day.
-- Used to compare actual cost, market value when acquired (the tax base cost) and value now,
-- for example for Sharesave (SAYE) shares bought at a discount.
-- Per-share prices are in pence (REAL) so fractional pence such as £98.75 or $186.34357 stay exact.
CREATE TABLE share_lots (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id             INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                   TEXT    NOT NULL,
  ticker                 TEXT,                  -- optional: matches a synced Trading 212 holding to price the lot
  acquired_on            TEXT    NOT NULL,
  quantity               REAL    NOT NULL CHECK (quantity > 0),
  paid_per_share_pence   REAL    NOT NULL CHECK (paid_per_share_pence >= 0),
  market_per_share_pence REAL    CHECK (market_per_share_pence IS NULL OR market_per_share_pence >= 0),
  notes                  TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_share_lots_account ON share_lots (account_id);
