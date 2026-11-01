-- Individual buys and sells synced from Trading 212 order history.
-- Money is in pence in the account currency (GBP). Price is per share in the instrument's own currency.
CREATE TABLE trades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date              TEXT    NOT NULL,
  side              TEXT    NOT NULL CHECK (side IN ('buy', 'sell')),
  kind              TEXT    NOT NULL DEFAULT 'TRADE',   -- TRADE, or a corporate action such as STOCK_SPLIT
  ticker            TEXT    NOT NULL,
  name              TEXT,
  isin              TEXT,
  currency          TEXT,
  quantity          REAL    NOT NULL,
  price             REAL,
  value_pence       INTEGER,
  fees_pence        INTEGER NOT NULL DEFAULT 0,
  realised_pl_pence INTEGER,
  source            TEXT    NOT NULL DEFAULT 't212',
  external_ref      TEXT    NOT NULL,
  UNIQUE (account_id, external_ref)
);
CREATE INDEX idx_trades_account_date ON trades (account_id, date);
