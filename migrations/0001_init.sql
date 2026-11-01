-- All money is stored as integer pence to avoid floating point rounding.
-- All dates are ISO 'YYYY-MM-DD' strings (UK local date).

CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  provider      TEXT    NOT NULL,                 -- monzo | nsandi | trading212 | other
  type          TEXT    NOT NULL,                 -- cash | cash_isa | ss_isa | gia | premium_bonds
  interest_rate REAL,                             -- current AER %, for reference only
  t212_link     TEXT    UNIQUE,                   -- invest | isa | NULL (which T212 API key pair to sync from)
  opened_on     TEXT,
  archived      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date         TEXT    NOT NULL,
  type         TEXT    NOT NULL,  -- deposit | withdrawal | interest | prize | dividend | fee | transfer_in | transfer_out | bonus
  amount_pence INTEGER NOT NULL CHECK (amount_pence >= 0),
  notes        TEXT,
  source       TEXT    NOT NULL DEFAULT 'manual',   -- manual | t212 | csv
  external_ref TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, source, external_ref)
);
CREATE INDEX idx_transactions_account_date ON transactions (account_id, date);
CREATE INDEX idx_transactions_date ON transactions (date);

-- Point-in-time account values (end of day). Required for investment accounts, optional for cash
-- accounts (where they act as a balance check that corrects any drift from missing transactions).
CREATE TABLE valuations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  value_pence INTEGER NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'manual',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, date)
);

-- Per-holding snapshots, written by the Trading 212 sync.
CREATE TABLE holdings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,
  ticker        TEXT    NOT NULL,
  isin          TEXT,
  name          TEXT,
  currency      TEXT,
  quantity      REAL    NOT NULL,
  avg_price     REAL,
  current_price REAL,
  value_pence   INTEGER NOT NULL,
  cost_pence    INTEGER,
  UNIQUE (account_id, date, ticker)
);
CREATE INDEX idx_holdings_account_date ON holdings (account_id, date);

CREATE TABLE goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  kind         TEXT    NOT NULL,      -- balance (total balance reaches target) | yearly_savings (net saved in a tax year)
  target_pence INTEGER NOT NULL,
  target_date  TEXT,
  account_ids  TEXT,                  -- JSON array of account ids, NULL = all accounts
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Progress of each Trading 212 history stream, so a large backfill can continue over several runs.
CREATE TABLE sync_state (
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stream          TEXT    NOT NULL,   -- transactions | dividends
  backfill_cursor TEXT,
  backfill_done   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, stream)
);

CREATE TABLE sync_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT NOT NULL,          -- running | ok | error
  message     TEXT
);

INSERT INTO settings (key, value) VALUES
  ('tax_band', 'higher'),
  ('premium_bonds_prize_rate', '3.60');

INSERT INTO accounts (name, provider, type, t212_link, sort_order) VALUES
  ('Monzo Savings',        'monzo',      'cash',          NULL,     1),
  ('Premium Bonds',        'nsandi',     'premium_bonds', NULL,     2),
  ('Trading 212 Invest',   'trading212', 'gia',           'invest', 3),
  ('Trading 212 S&S ISA',  'trading212', 'ss_isa',        'isa',    4),
  ('Trading 212 Cash ISA', 'trading212', 'cash_isa',      NULL,     5);
