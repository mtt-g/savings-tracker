-- One-off seed for the Aviva workplace pension (Av MyM My Future Long Term Growth TS).
-- Value on 3 Nov 2026: 155,441.7705 units x GBP 1.0052 = GBP 156,250.07. Safe to run twice.
-- Contributions are GBP 1,061.39 a month (including the employer's share), tracked from 30 Oct 2026. Only the first
-- is seeded; add each later month as a deposit.

INSERT INTO accounts (name, provider, type, sort_order)
SELECT 'Aviva Workplace Pension', 'other', 'pension', 7
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Aviva Workplace Pension');

INSERT OR IGNORE INTO valuations (account_id, date, value_pence, source)
SELECT id, '2026-11-03', 15625007, 'manual'
FROM accounts WHERE name = 'Aviva Workplace Pension';

INSERT OR IGNORE INTO transactions (account_id, date, type, amount_pence, notes, source, external_ref)
SELECT id, '2026-10-30', 'deposit', 106139, 'Monthly contribution (employee + employer)', 'manual', 'seed:aviva-2026-10'
FROM accounts WHERE name = 'Aviva Workplace Pension';
