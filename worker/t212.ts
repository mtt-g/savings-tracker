import { londonDateOf, todayLondon } from "../shared/dates";
import type { Account, T212Link, TxType } from "../shared/types";

/**
 * Trading 212 public API client and sync.
 * Docs: https://docs.trading212.com/api. Supports Invest and Stocks ISA accounts only, so the
 * Cash ISA has to be tracked manually. Each T212 account has its own API key and secret.
 */

const BASE = "https://live.trading212.com";
const PAGE_LIMIT = 50;
/**
 * History endpoints allow 20 requests a minute. Capping pages per stream per run keeps us under that
 * and under the Workers subrequest limit. A long history backfills over several runs.
 */
const MAX_PAGES_PER_RUN = 8;

interface AccountSummary {
  currency: string;
  totalValue: number;
  cash: { availableToTrade: number; inPies: number; reservedForOrders: number };
  investments: { currentValue: number; totalCost: number; realizedProfitLoss: number; unrealizedProfitLoss: number };
}

interface Position {
  quantity: number;
  averagePricePaid: number;
  currentPrice: number;
  instrument: { ticker: string; isin: string; name: string; currency: string };
  walletImpact: { currency: string; currentValue: number; totalCost: number; unrealizedProfitLoss: number };
}

interface Page<T> {
  items: T[];
  nextPagePath: string | null;
}

interface HistoryTransaction {
  type: "WITHDRAW" | "DEPOSIT" | "FEE" | "TRANSFER" | "INTEREST_ON_FREE_CASH" | "LENDING_INTEREST" | string;
  amount: number;
  currency: string;
  dateTime: string;
  reference: string;
}

interface HistoryDividend {
  amount: number;
  currency: string;
  paidOn: string;
  quantity: number;
  reference: string;
  ticker: string;
  type: string;
}

interface Row {
  date: string;
  type: TxType;
  amount_pence: number;
  notes: string | null;
  external_ref: string;
}

export class T212Error extends Error {}

export function credentialsFor(env: Env, link: T212Link): string | null {
  const [key, secret] =
    link === "invest" ? [env.T212_INVEST_KEY, env.T212_INVEST_SECRET] : [env.T212_ISA_KEY, env.T212_ISA_SECRET];
  if (!key || !secret) return null;
  return `Basic ${btoa(`${key}:${secret}`)}`;
}

async function t212Get<T>(auth: string, path: string): Promise<T> {
  const url = path.startsWith("/api/") ? `${BASE}${path}` : `${BASE}/api/v0${path}`;
  const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const wait = reset ? Math.max(0, Math.ceil(reset - Date.now() / 1000)) : null;
    throw new T212Error(`Trading 212 rate limit hit${wait !== null ? `, try again in ${wait}s` : ""}`);
  }
  if (res.status === 401 || res.status === 403) throw new T212Error("Trading 212 rejected the API key. Check the key, the secret and its permissions.");
  if (!res.ok) throw new T212Error(`Trading 212 ${path.split("?")[0]} returned ${res.status}`);
  return res.json<T>();
}

const toPence = (n: number) => Math.round(n * 100);

export function mapTransaction(t: HistoryTransaction): Row | null {
  if (t.currency && t.currency !== "GBP") return null;
  const amount_pence = Math.abs(toPence(t.amount));
  if (!amount_pence) return null;
  const typeMap: Record<string, TxType | undefined> = {
    DEPOSIT: "deposit",
    WITHDRAW: "withdrawal",
    FEE: "fee",
    INTEREST_ON_FREE_CASH: "interest",
    LENDING_INTEREST: "interest",
    TRANSFER: t.amount >= 0 ? "transfer_in" : "transfer_out",
  };
  const type = typeMap[t.type];
  if (!type) return null;
  const notes = t.type === "LENDING_INTEREST" ? "Share lending interest" : t.type === "TRANSFER" ? "Trading 212 internal transfer" : null;
  return { date: londonDateOf(t.dateTime), type, amount_pence, notes, external_ref: `tx:${t.reference}` };
}

export function mapDividend(d: HistoryDividend): Row | null {
  if (d.currency && d.currency !== "GBP") return null;
  const amount_pence = toPence(d.amount);
  if (amount_pence <= 0) return null;
  return {
    date: londonDateOf(d.paidOn),
    type: "dividend",
    amount_pence,
    notes: d.ticker,
    external_ref: `div:${d.reference}`,
  };
}

async function insertRows(db: D1Database, accountId: number, rows: Row[]): Promise<number> {
  if (!rows.length) return 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO transactions (account_id, date, type, amount_pence, notes, source, external_ref)
     VALUES (?, ?, ?, ?, ?, 't212', ?)`,
  );
  const results = await db.batch(rows.map((r) => stmt.bind(accountId, r.date, r.type, r.amount_pence, r.notes, r.external_ref)));
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

async function countKnown(db: D1Database, accountId: number, refs: string[]): Promise<number> {
  if (!refs.length) return 0;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND source = 't212'
       AND external_ref IN (SELECT value FROM json_each(?))`,
    )
    .bind(accountId, JSON.stringify(refs))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Pulls one paginated history stream (newest first).
 * First runs walk back through the full history, saving a cursor so the next run continues where
 * this one stopped. Once that's done, each run reads from the newest page until it reaches items
 * it already has.
 */
async function syncStream<T>(
  db: D1Database,
  auth: string,
  accountId: number,
  stream: "transactions" | "dividends",
  firstPath: string,
  map: (item: T) => Row | null,
): Promise<{ inserted: number; backfillDone: boolean }> {
  const state = await db
    .prepare("SELECT backfill_cursor, backfill_done FROM sync_state WHERE account_id = ? AND stream = ?")
    .bind(accountId, stream)
    .first<{ backfill_cursor: string | null; backfill_done: number }>();

  let inserted = 0;
  let pages = 0;

  if (state?.backfill_done) {
    let path: string | null = firstPath;
    while (path && pages < MAX_PAGES_PER_RUN) {
      const page: Page<T> = await t212Get<Page<T>>(auth, path);
      pages++;
      const rows = page.items.map(map).filter((r): r is Row => r !== null);
      const known = await countKnown(db, accountId, rows.map((r) => r.external_ref));
      inserted += await insertRows(db, accountId, rows);
      if (known > 0) break;
      path = page.nextPagePath;
    }
    return { inserted, backfillDone: true };
  }

  let path: string | null = state?.backfill_cursor ?? firstPath;
  while (path && pages < MAX_PAGES_PER_RUN) {
    const page: Page<T> = await t212Get<Page<T>>(auth, path);
    pages++;
    inserted += await insertRows(db, accountId, page.items.map(map).filter((r): r is Row => r !== null));
    path = page.nextPagePath;
  }
  const done = path === null;
  await db
    .prepare(
      `INSERT INTO sync_state (account_id, stream, backfill_cursor, backfill_done) VALUES (?, ?, ?, ?)
       ON CONFLICT (account_id, stream) DO UPDATE SET backfill_cursor = excluded.backfill_cursor, backfill_done = excluded.backfill_done`,
    )
    .bind(accountId, stream, done ? null : path, done ? 1 : 0)
    .run();
  return { inserted, backfillDone: done };
}

export async function syncAccount(env: Env, account: Account): Promise<string> {
  if (!account.t212_link) throw new T212Error(`${account.name} isn't linked to Trading 212`);
  const auth = credentialsFor(env, account.t212_link);
  if (!auth) {
    const prefix = account.t212_link === "invest" ? "T212_INVEST" : "T212_ISA";
    throw new T212Error(`No API key set. Add the ${prefix}_KEY and ${prefix}_SECRET secrets.`);
  }
  const db = env.DB;
  const today = todayLondon();

  const summary = await t212Get<AccountSummary>(auth, "/equity/account/summary");
  if (summary.currency !== "GBP") throw new T212Error(`Account currency is ${summary.currency}; only GBP is supported`);

  const positions = await t212Get<Position[]>(auth, "/equity/positions");
  const holdingStmt = db.prepare(
    `INSERT INTO holdings (account_id, date, ticker, isin, name, currency, quantity, avg_price, current_price, value_pence, cost_pence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO valuations (account_id, date, value_pence, source) VALUES (?, ?, ?, 't212')
         ON CONFLICT (account_id, date) DO UPDATE SET value_pence = excluded.value_pence, source = 't212'`,
      )
      .bind(account.id, today, toPence(summary.totalValue)),
    db.prepare("DELETE FROM holdings WHERE account_id = ? AND date = ?").bind(account.id, today),
    ...positions.map((p) =>
      holdingStmt.bind(
        account.id,
        today,
        p.instrument.ticker,
        p.instrument.isin ?? null,
        p.instrument.name ?? null,
        p.instrument.currency ?? null,
        p.quantity,
        p.averagePricePaid ?? null,
        p.currentPrice ?? null,
        toPence(p.walletImpact.currentValue),
        toPence(p.walletImpact.totalCost),
      ),
    ),
  ]);

  const tx = await syncStream<HistoryTransaction>(
    db, auth, account.id, "transactions", `/equity/history/transactions?limit=${PAGE_LIMIT}`, mapTransaction,
  );
  const div = await syncStream<HistoryDividend>(
    db, auth, account.id, "dividends", `/equity/history/dividends?limit=${PAGE_LIMIT}`, mapDividend,
  );

  const parts = [
    `Value £${summary.totalValue.toFixed(2)}`,
    `${positions.length} holdings`,
    `${tx.inserted} new transactions`,
    `${div.inserted} new dividends`,
  ];
  if (!tx.backfillDone || !div.backfillDone) parts.push("history still loading, sync again in a minute to continue");
  return parts.join(", ");
}

/** Syncs one account and records the run in sync_runs. */
export async function runSync(env: Env, account: Account): Promise<{ ok: boolean; message: string }> {
  const run = await env.DB.prepare("INSERT INTO sync_runs (account_id, status) VALUES (?, 'running') RETURNING id")
    .bind(account.id)
    .first<{ id: number }>();
  let ok = true;
  let message: string;
  try {
    message = await syncAccount(env, account);
  } catch (e) {
    ok = false;
    message = e instanceof T212Error ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
    if (!(e instanceof T212Error)) console.error("T212 sync failed", e);
  }
  await env.DB.prepare("UPDATE sync_runs SET status = ?, message = ?, finished_at = datetime('now') WHERE id = ?")
    .bind(ok ? "ok" : "error", message, run!.id)
    .run();
  return { ok, message };
}

export async function syncAll(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM accounts WHERE t212_link IS NOT NULL AND archived = 0",
  ).all<Account>();
  for (const a of results) await runSync(env, a);
  // Keep the run log short.
  await env.DB.prepare("DELETE FROM sync_runs WHERE started_at < datetime('now', '-90 days')").run();
}
