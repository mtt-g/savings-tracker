-- One-off seed for the EquatePlus Share Plan account (a GIA holding Flutter shares) and the cost basis of the
-- Sharesave shares, taken from the EquatePlus portfolio export dated 1 Nov 2026.
-- Safe to run if you've already created an account with this name: it's reused, and nothing is inserted twice.

-- The account itself. A taxable general investment account, not an ISA.
INSERT INTO accounts (name, provider, type, sort_order)
SELECT 'EquatePlus (Flutter)', 'other', 'gia', 6
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'EquatePlus (Flutter)');

-- What you paid for the 72 shares still held (72 x GBP 98.75 strike price). The 4 free shares cost nothing.
INSERT OR IGNORE INTO transactions (account_id, date, type, amount_pence, notes, source, external_ref)
SELECT id, '2024-04-16', 'deposit', 711000, 'Sharesave 2020 option exercised: 72 shares at 98.75', 'manual', 'seed:equateplus-2020-sharesave'
FROM accounts WHERE name = 'EquatePlus (Flutter)';

-- Value on the export date: 76 shares, GBP 246.82 + GBP 4,442.91.
INSERT OR IGNORE INTO valuations (account_id, date, value_pence, source)
SELECT id, '2026-11-01', 468974, 'manual'
FROM accounts WHERE name = 'EquatePlus (Flutter)';

-- Cost basis lots. Prices are pence per share.
-- 2020 Sharesave: strike GBP 98.75, share price on the day GBP 149.85 (the tax base cost).
INSERT INTO share_lots (account_id, name, acquired_on, quantity, paid_per_share_pence, market_per_share_pence, notes)
SELECT id, 'Flutter, 2020 Sharesave', '2024-04-16', 72, 9875, 14985, 'Remaining shares from the 92 exercised; 20 were sold'
FROM accounts WHERE name = 'EquatePlus (Flutter)'
AND NOT EXISTS (SELECT 1 FROM share_lots WHERE name = 'Flutter, 2020 Sharesave');

-- Free share award. The export has no cost basis for these, so the market price is left blank. Add it if you find it.
INSERT INTO share_lots (account_id, name, acquired_on, quantity, paid_per_share_pence, market_per_share_pence, notes)
SELECT id, 'Flutter, 2022 award', '2022-06-01', 4, 0, NULL, 'Free award'
FROM accounts WHERE name = 'EquatePlus (Flutter)'
AND NOT EXISTS (SELECT 1 FROM share_lots WHERE name = 'Flutter, 2022 award');

-- 2021 Sharesave: strike GBP 115.96, share price on the day GBP 213.20. These 76 shares were transferred to the
-- Trading 212 Stocks ISA, so the lot belongs to that account. Match it to the Flutter holding in the app once synced.
INSERT INTO share_lots (account_id, name, acquired_on, quantity, paid_per_share_pence, market_per_share_pence, notes)
SELECT id, 'Flutter, 2021 Sharesave', '2024-12-10', 76, 11596, 21320, 'Transferred to the Stocks ISA'
FROM accounts WHERE t212_link = 'isa'
AND NOT EXISTS (SELECT 1 FROM share_lots WHERE name = 'Flutter, 2021 Sharesave')
LIMIT 1;
