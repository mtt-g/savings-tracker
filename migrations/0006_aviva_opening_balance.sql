-- Opening balance for the Aviva pension: what was already in it before contributions were tracked from 30 Oct 2026,
-- so growth and return are measured from there rather than counting the whole balance as growth.
-- 15,625,007 (value on 3 Nov 2026) less the 106,139 contribution seeded in 0005.
INSERT OR IGNORE INTO transactions (account_id, date, type, amount_pence, notes, source, external_ref)
SELECT id, '2026-10-29', 'transfer_in', 15518868, 'Opening balance before tracking started', 'manual', 'seed:aviva-opening'
FROM accounts WHERE name = 'Aviva Workplace Pension';
