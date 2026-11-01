import type { Account, Goal, Settings, Transaction, Valuation } from "../shared/types";

export async function getAccounts(db: D1Database): Promise<Account[]> {
  const { results } = await db.prepare("SELECT * FROM accounts ORDER BY sort_order, id").all<Account>();
  return results;
}

export async function getAccount(db: D1Database, id: number): Promise<Account | null> {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Account>();
}

export async function getTransactions(db: D1Database, accountId?: number): Promise<Transaction[]> {
  const stmt = accountId
    ? db.prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY date, id").bind(accountId)
    : db.prepare("SELECT * FROM transactions ORDER BY date, id");
  return (await stmt.all<Transaction>()).results;
}

export async function getValuations(db: D1Database, accountId?: number): Promise<Valuation[]> {
  const stmt = accountId
    ? db.prepare("SELECT * FROM valuations WHERE account_id = ? ORDER BY date").bind(accountId)
    : db.prepare("SELECT * FROM valuations ORDER BY date");
  return (await stmt.all<Valuation>()).results;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    tax_band: (map.tax_band as Settings["tax_band"]) ?? "higher",
    premium_bonds_prize_rate: Number(map.premium_bonds_prize_rate ?? 3.6),
  };
}

export async function getGoals(db: D1Database): Promise<Goal[]> {
  const { results } = await db
    .prepare("SELECT * FROM goals ORDER BY id")
    .all<Omit<Goal, "account_ids"> & { account_ids: string | null }>();
  return results.map((g) => ({ ...g, account_ids: g.account_ids ? (JSON.parse(g.account_ids) as number[]) : null }));
}
