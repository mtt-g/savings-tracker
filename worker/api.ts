import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { accountHistory, buildLedgers, computeDashboard, Ledger, periodStats } from "../shared/calc";
import { todayLondon } from "../shared/dates";
import { taxYearOf, taxYearRange } from "../shared/tax";
import type { Holding, SyncRun } from "../shared/types";
import { getAccount, getAccounts, getGoals, getSettings, getTransactions, getValuations } from "./db";
import { credentialsFor, runSync } from "./t212";
import type { AppEnv } from "./types";
import {
  accountInput,
  bulkTransactionInput,
  goalInput,
  isoDate,
  parse,
  settingsInput,
  transactionInput,
  valuationInput,
} from "./validate";

export const api = new Hono<AppEnv>();

const idParam = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HTTPException(400, { message: "Invalid id" });
  return id;
};

const notFound = () => new HTTPException(404, { message: "Not found" });

// ---------- Dashboard ----------

api.get("/dashboard", async (c) => {
  const today = todayLondon();
  const defaultRange = taxYearRange(taxYearOf(today));
  const db = c.env.DB;
  const [accounts, transactions, valuations, settings, goals] = await Promise.all([
    getAccounts(db),
    getTransactions(db),
    getValuations(db),
    getSettings(db),
    getGoals(db),
  ]);
  const to = parse(isoDate, c.req.query("to") ?? today, "to");
  const fromParam = c.req.query("from") ?? defaultRange.from;
  // "all" starts from the earliest transaction or valuation.
  const from =
    fromParam === "all"
      ? [transactions[0]?.date, valuations[0]?.date, to].filter((d): d is string => !!d).sort()[0]
      : parse(isoDate, fromParam, "from");
  if (from > to) throw new HTTPException(400, { message: "'from' must be on or before 'to'" });
  return c.json(computeDashboard({ accounts, transactions, valuations, settings, goals, from, to, today }));
});

// ---------- Accounts ----------

api.get("/accounts", async (c) => {
  const db = c.env.DB;
  const today = todayLondon();
  const ty = taxYearRange(taxYearOf(today));
  const [accounts, transactions, valuations, lastSyncs] = await Promise.all([
    getAccounts(db),
    getTransactions(db),
    getValuations(db),
    db
      .prepare(
        `SELECT r.* FROM sync_runs r JOIN (SELECT account_id, MAX(id) AS id FROM sync_runs GROUP BY account_id) m ON m.id = r.id`,
      )
      .all<SyncRun>(),
  ]);
  const ledgers = buildLedgers(accounts, transactions, valuations);
  return c.json(
    accounts.map((a) => {
      const ledger = ledgers.get(a.id)!;
      return {
        ...a,
        balance: ledger.valueAt(today),
        lastValuation: ledger.vals.at(-1)?.date ?? null,
        taxYear: periodStats(ledger, ty.from, today),
        lastSync: lastSyncs.results.find((r) => r.account_id === a.id) ?? null,
        t212Configured: a.t212_link ? credentialsFor(c.env, a.t212_link) !== null : null,
      };
    }),
  );
});

api.get("/accounts/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const db = c.env.DB;
  const account = await getAccount(db, id);
  if (!account) throw notFound();
  const today = todayLondon();
  const [transactions, valuations] = await Promise.all([getTransactions(db, id), getValuations(db, id)]);
  const ledger = new Ledger(transactions, valuations);
  const latest = await db.prepare("SELECT MAX(date) AS d FROM holdings WHERE account_id = ?").bind(id).first<{ d: string | null }>();
  const holdings = latest?.d
    ? (await db.prepare("SELECT * FROM holdings WHERE account_id = ? AND date = ? ORDER BY value_pence DESC").bind(id, latest.d).all<Holding>()).results
    : [];
  return c.json({
    account,
    balance: ledger.valueAt(today),
    history: accountHistory(ledger, today),
    allTime: ledger.txs.length || ledger.vals.length ? periodStats(ledger, ledger.txs[0]?.date ?? ledger.vals[0].date, today) : null,
    valuations: [...valuations].reverse().slice(0, 100),
    holdings,
    holdingsDate: latest?.d ?? null,
  });
});

api.post("/accounts", async (c) => {
  const a = parse(accountInput, await c.req.json());
  const row = await c.env.DB.prepare(
    `INSERT INTO accounts (name, provider, type, interest_rate, t212_link, opened_on, archived, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(a.name, a.provider, a.type, a.interest_rate, a.t212_link, a.opened_on, a.archived ? 1 : 0, a.sort_order)
    .first();
  return c.json(row, 201);
});

api.put("/accounts/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const a = parse(accountInput, await c.req.json());
  const row = await c.env.DB.prepare(
    `UPDATE accounts SET name = ?, provider = ?, type = ?, interest_rate = ?, t212_link = ?, opened_on = ?, archived = ?, sort_order = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(a.name, a.provider, a.type, a.interest_rate, a.t212_link, a.opened_on, a.archived ? 1 : 0, a.sort_order, id)
    .first();
  if (!row) throw notFound();
  return c.json(row);
});

api.delete("/accounts/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  // D1 enforces foreign keys, so this also deletes the account's transactions, valuations and holdings.
  const r = await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
  if (!r.meta.changes) throw notFound();
  return c.body(null, 204);
});

// ---------- Transactions ----------

api.get("/transactions", async (c) => {
  const where: string[] = [];
  const binds: unknown[] = [];
  const accountId = c.req.query("account_id");
  if (accountId) { where.push("account_id = ?"); binds.push(idParam(accountId)); }
  const type = c.req.query("type");
  if (type) { where.push("type = ?"); binds.push(type); }
  const from = c.req.query("from");
  if (from) { where.push("date >= ?"); binds.push(parse(isoDate, from, "from")); }
  const to = c.req.query("to");
  if (to) { where.push("date <= ?"); binds.push(parse(isoDate, to, "to")); }
  const sql = `SELECT * FROM transactions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY date DESC, id DESC LIMIT 2000`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

api.post("/transactions", async (c) => {
  const t = parse(transactionInput, await c.req.json());
  const row = await c.env.DB.prepare(
    `INSERT INTO transactions (account_id, date, type, amount_pence, notes) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(t.account_id, t.date, t.type, t.amount_pence, t.notes)
    .first();
  return c.json(row, 201);
});

api.post("/transactions/bulk", async (c) => {
  const b = parse(bulkTransactionInput, await c.req.json());
  const db = c.env.DB;
  if (!(await getAccount(db, b.account_id))) throw notFound();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO transactions (account_id, date, type, amount_pence, notes, source, external_ref) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let inserted = 0;
  // D1 caps statements per batch, so insert in chunks.
  for (let i = 0; i < b.rows.length; i += 500) {
    const chunk = b.rows.slice(i, i + 500);
    const results = await db.batch(chunk.map((r) => stmt.bind(b.account_id, r.date, r.type, r.amount_pence, r.notes, b.source, r.external_ref)));
    inserted += results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }
  return c.json({ inserted, skipped: b.rows.length - inserted });
});

api.put("/transactions/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const t = parse(transactionInput, await c.req.json());
  const row = await c.env.DB.prepare(
    `UPDATE transactions SET account_id = ?, date = ?, type = ?, amount_pence = ?, notes = ? WHERE id = ? RETURNING *`,
  )
    .bind(t.account_id, t.date, t.type, t.amount_pence, t.notes, id)
    .first();
  if (!row) throw notFound();
  return c.json(row);
});

api.delete("/transactions/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(idParam(c.req.param("id"))).run();
  if (!r.meta.changes) throw notFound();
  return c.body(null, 204);
});

// ---------- Valuations ----------

api.put("/valuations", async (c) => {
  const v = parse(valuationInput, await c.req.json());
  const row = await c.env.DB.prepare(
    `INSERT INTO valuations (account_id, date, value_pence, source) VALUES (?, ?, ?, 'manual')
     ON CONFLICT (account_id, date) DO UPDATE SET value_pence = excluded.value_pence, source = 'manual' RETURNING *`,
  )
    .bind(v.account_id, v.date, v.value_pence)
    .first();
  return c.json(row);
});

api.delete("/valuations/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM valuations WHERE id = ?").bind(idParam(c.req.param("id"))).run();
  if (!r.meta.changes) throw notFound();
  return c.body(null, 204);
});

// ---------- Trading 212 sync ----------

api.post("/accounts/:id/sync", async (c) => {
  const account = await getAccount(c.env.DB, idParam(c.req.param("id")));
  if (!account) throw notFound();
  const result = await runSync(c.env, account);
  return c.json(result, result.ok ? 200 : 502);
});

api.get("/sync-runs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 50").all<SyncRun>();
  return c.json(results);
});

// ---------- Settings & goals ----------

api.get("/settings", async (c) => c.json(await getSettings(c.env.DB)));

api.put("/settings", async (c) => {
  const s = parse(settingsInput, await c.req.json());
  const stmt = c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  await c.env.DB.batch([stmt.bind("tax_band", s.tax_band), stmt.bind("premium_bonds_prize_rate", String(s.premium_bonds_prize_rate))]);
  return c.json(s);
});

api.get("/goals", async (c) => c.json(await getGoals(c.env.DB)));

api.post("/goals", async (c) => {
  const g = parse(goalInput, await c.req.json());
  const row = await c.env.DB.prepare(
    "INSERT INTO goals (name, kind, target_pence, target_date, account_ids) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(g.name, g.kind, g.target_pence, g.target_date, g.account_ids ? JSON.stringify(g.account_ids) : null)
    .first<{ id: number }>();
  return c.json({ id: row!.id, ...g }, 201);
});

api.put("/goals/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const g = parse(goalInput, await c.req.json());
  const r = await c.env.DB.prepare("UPDATE goals SET name = ?, kind = ?, target_pence = ?, target_date = ?, account_ids = ? WHERE id = ?")
    .bind(g.name, g.kind, g.target_pence, g.target_date, g.account_ids ? JSON.stringify(g.account_ids) : null, id)
    .run();
  if (!r.meta.changes) throw notFound();
  return c.json({ id, ...g });
});

api.delete("/goals/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM goals WHERE id = ?").bind(idParam(c.req.param("id"))).run();
  if (!r.meta.changes) throw notFound();
  return c.body(null, 204);
});

// ---------- Export ----------

api.get("/export", async (c) => {
  const db = c.env.DB;
  const tables = ["accounts", "transactions", "valuations", "holdings", "goals", "settings"] as const;
  const data = Object.fromEntries(
    await Promise.all(tables.map(async (t) => [t, (await db.prepare(`SELECT * FROM ${t}`).all()).results] as const)),
  );
  c.header("Content-Disposition", `attachment; filename="savings-tracker-${todayLondon()}.json"`);
  return c.json({ exportedAt: new Date().toISOString(), ...data });
});
