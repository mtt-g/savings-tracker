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
 * History endpoints allow 20 requests a minute, and a free-plan Worker may make 50 subrequests (fetches and
 * D1 calls) per invocation. Each page costs two (one fetch, one D1 batch), and a sync reads three streams
 * plus two summary calls, so capping at 5 pages per stream keeps one account's sync near 35. A long history
 * backfills over several runs.
 */
const MAX_PAGES_PER_RUN = 5;

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

interface HistoricalOrderItem {
  order?: {
    id: number;
    side?: "BUY" | "SELL";
    ticker?: string;
    currency?: string;
    instrument?: { ticker?: string; name?: string; isin?: string; currency?: string };
  };
  fill?: {
    id: number;
    filledAt: string;
    price?: number;
    quantity: number;
    type?: string;
    walletImpact?: {
      currency?: string;
      netValue?: number;
      realisedProfitLoss?: number;
      taxes?: { name?: string; quantity?: number; currency?: string }[];
    };
  };
}

export interface TradeRow {
  date: string;
  side: "buy" | "sell";
  kind: string;
  ticker: string;
  name: string | null;
  isin: string | null;
  currency: string | null;
  quantity: number;
  price: number | null;
  value_pence: number | null;
  fees_pence: number;
  realised_pl_pence: number | null;
  external_ref: string;
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

export function mapOrder(item: HistoricalOrderItem): TradeRow | null {
  const { order, fill } = item;
  if (!order || !fill) return null;
  const quantity = Math.abs(fill.quantity);
  const ticker = order.ticker ?? order.instrument?.ticker;
  if (!quantity || !ticker) return null;
  const side = order.side === "SELL" ? "sell" : order.side === "BUY" ? "buy" : fill.quantity < 0 ? "sell" : "buy";
  const wallet = fill.walletImpact;
  // Only trust money amounts reported in the account's own currency.
  const gbp = !wallet?.currency || wallet.currency === "GBP";
  const fees = gbp ? (wallet?.taxes ?? []).reduce((n, t) => n + (!t.currency || t.currency === "GBP" ? Math.abs(toPence(t.quantity ?? 0)) : 0), 0) : 0;
  return {
    date: londonDateOf(fill.filledAt),
    side,
    kind: fill.type ?? "TRADE",
    ticker,
    name: order.instrument?.name ?? null,
    isin: order.instrument?.isin ?? null,
    currency: order.instrument?.currency ?? order.currency ?? null,
    quantity,
    price: fill.price ?? null,
    value_pence: gbp && wallet?.netValue != null ? Math.abs(toPence(wallet.netValue)) : null,
    fees_pence: fees,
    realised_pl_pence: gbp && wallet?.realisedProfitLoss != null ? toPence(wallet.realisedProfitLoss) : null,
    external_ref: `fill:${fill.id}`,
  };
}

async function insertTradeRows(db: D1Database, accountId: number, rows: TradeRow[]): Promise<number> {
  if (!rows.length) return 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO trades (account_id, date, side, kind, ticker, name, isin, currency, quantity, price, value_pence, fees_pence, realised_pl_pence, source, external_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 't212', ?)`,
  );
  const results = await db.batch(
    rows.map((r) =>
      stmt.bind(accountId, r.date, r.side, r.kind, r.ticker, r.name, r.isin, r.currency, r.quantity, r.price, r.value_pence, r.fees_pence, r.realised_pl_pence, r.external_ref),
    ),
  );
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
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

/**
 * Pulls one paginated history stream (newest first).
 * First runs walk back through the full history, saving a cursor so the next run continues where
 * this one stopped. Once that's done, each run reads from the newest page until it reaches items
 * it already has.
 */
async function syncStream<T, R extends { external_ref: string }>(
  db: D1Database,
  auth: string,
  accountId: number,
  stream: "transactions" | "dividends" | "orders",
  firstPath: string,
  map: (item: T) => R | null,
  insert: (rows: R[]) => Promise<number>,
): Promise<{ inserted: number; backfillDone: boolean }> {
  const state = await db
    .prepare("SELECT backfill_cursor, backfill_done FROM sync_state WHERE account_id = ? AND stream = ?")
    .bind(accountId, stream)
    .first<{ backfill_cursor: string | null; backfill_done: number }>();

  let inserted = 0;
  let pages = 0;

  if (state?.backfill_done) {
    // Caught up: read from the newest page and stop once a page contains rows we already have.
    let path: string | null = firstPath;
    while (path && pages < MAX_PAGES_PER_RUN) {
      const page: Page<T> = await t212Get<Page<T>>(auth, path);
      pages++;
      const rows = page.items.map(map).filter((r): r is R => r !== null);
      const added = await insert(rows);
      inserted += added;
      if (rows.length > 0 && added < rows.length) break;
      path = page.nextPagePath;
    }
    return { inserted, backfillDone: true };
  }

  let path: string | null = state?.backfill_cursor ?? firstPath;
  while (path && pages < MAX_PAGES_PER_RUN) {
    const page: Page<T> = await t212Get<Page<T>>(auth, path);
    pages++;
    inserted += await insert(page.items.map(map).filter((r): r is R => r !== null));
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

/**
 * Syncs one account. With `history: false` only the account value and holdings are refreshed (2 API calls), which is
 * what the frequent price refresh uses; the daily run and "Sync now" also pull transactions, dividends and trades.
 */
export async function syncAccount(env: Env, account: Account, opts: { history?: boolean } = {}): Promise<string> {
  const history = opts.history ?? true;
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

  if (!history) return `${PRICE_REFRESH_PREFIX}Value £${summary.totalValue.toFixed(2)}, ${positions.length} holdings`;

  const insertTx = (rows: Row[]) => insertRows(db, account.id, rows);
  const tx = await syncStream<HistoryTransaction, Row>(
    db, auth, account.id, "transactions", `/equity/history/transactions?limit=${PAGE_LIMIT}`, mapTransaction, insertTx,
  );
  const div = await syncStream<HistoryDividend, Row>(
    db, auth, account.id, "dividends", `/equity/history/dividends?limit=${PAGE_LIMIT}`, mapDividend, insertTx,
  );
  const ord = await syncStream<HistoricalOrderItem, TradeRow>(
    db, auth, account.id, "orders", `/equity/history/orders?limit=${PAGE_LIMIT}`, mapOrder, (rows) => insertTradeRows(db, account.id, rows),
  );

  const parts = [
    `Value £${summary.totalValue.toFixed(2)}`,
    `${positions.length} holdings`,
    `${tx.inserted} new transactions`,
    `${div.inserted} new dividends`,
    `${ord.inserted} new trades`,
  ];
  if (!tx.backfillDone || !div.backfillDone || !ord.backfillDone) parts.push("history still loading, sync again in a minute to continue");
  return parts.join(", ");
}

/** Prefix on the message of price-only refresh runs, which replace each other in sync_runs. */
const PRICE_REFRESH_PREFIX = "Prices refreshed: ";

/** Syncs one account and records the run in sync_runs. */
export async function runSync(env: Env, account: Account, opts: { history?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  const history = opts.history ?? true;
  const run = !history ? null : await env.DB.prepare("INSERT INTO sync_runs (account_id, status) VALUES (?, 'running') RETURNING id")
    .bind(account.id)
    .first<{ id: number }>();
  let ok = true;
  let message: string;
  try {
    message = await syncAccount(env, account, opts);
  } catch (e) {
    ok = false;
    message = e instanceof T212Error ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
    if (!(e instanceof T212Error)) console.error("T212 sync failed", e);
  }
  if (run) {
    await env.DB.prepare("UPDATE sync_runs SET status = ?, message = ?, finished_at = datetime('now') WHERE id = ?")
      .bind(ok ? "ok" : "error", message, run.id)
      .run();
  } else {
    // Price refreshes keep a single row per account (replacing the previous one) so the "last sync" time stays current
    // without filling the run log.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sync_runs WHERE account_id = ? AND message LIKE ?").bind(account.id, `${PRICE_REFRESH_PREFIX}%`),
      env.DB.prepare("INSERT INTO sync_runs (account_id, status, message, finished_at) VALUES (?, ?, ?, datetime('now'))")
        .bind(account.id, ok ? "ok" : "error", message),
    ]);
  }
  return { ok, message };
}

/**
 * Values accounts that aren't synced (for example an EquatePlus share plan) from the share prices of their lots'
 * Trading 212 holdings, and records the result as today's balance. Skipped for an account unless every one of its lots
 * has a ticker with a synced holding, so a half-priced total is never written.
 */
export async function revalueLinkedAccounts(db: D1Database) {
  const today = todayLondon();
  const { results: lots } = await db
    .prepare(
      `SELECT l.account_id, l.ticker, l.quantity FROM share_lots l JOIN accounts a ON a.id = l.account_id
       WHERE a.t212_link IS NULL AND a.archived = 0`,
    )
    .all<{ account_id: number; ticker: string | null; quantity: number }>();
  if (!lots.length) return;
  const { results: holdings } = await db
    .prepare(
      `SELECT h.ticker, h.quantity, h.value_pence FROM holdings h
       JOIN (SELECT account_id, MAX(date) AS d FROM holdings GROUP BY account_id) m ON m.account_id = h.account_id AND m.d = h.date
       WHERE h.quantity > 0`,
    )
    .all<{ ticker: string; quantity: number; value_pence: number }>();
  const perShare = new Map(holdings.map((h) => [h.ticker, h.value_pence / h.quantity]));

  const totals = new Map<number, number | null>();
  for (const l of lots) {
    const price = l.ticker ? perShare.get(l.ticker) : undefined;
    const prev = totals.get(l.account_id);
    if (price === undefined || prev === null) totals.set(l.account_id, null);
    else totals.set(l.account_id, (prev ?? 0) + l.quantity * price);
  }
  const stmt = db.prepare(
    `INSERT INTO valuations (account_id, date, value_pence, source) VALUES (?, ?, ?, 'linked')
     ON CONFLICT (account_id, date) DO UPDATE SET value_pence = excluded.value_pence, source = 'linked'`,
  );
  const writes = [...totals].filter(([, v]) => v !== null).map(([id, v]) => stmt.bind(id, today, Math.round(v!)));
  if (writes.length) await db.batch(writes);
}

export async function syncAll(env: Env, opts: { history?: boolean } = {}) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM accounts WHERE t212_link IS NOT NULL AND archived = 0",
  ).all<Account>();
  for (const a of results) await runSync(env, a, opts);
  await revalueLinkedAccounts(env.DB);
  if (opts.history === false) return;
  // Keep the run log short.
  await env.DB.prepare("DELETE FROM sync_runs WHERE started_at < datetime('now', '-90 days')").run();
}
