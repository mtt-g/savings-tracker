import { describe, expect, it } from "vitest";
import { computeDashboard, Ledger, periodStats } from "./calc";
import { monthEndsBetween } from "./dates";
import { taxYearLabel, taxYearOf } from "./tax";
import type { Account, Transaction, TxType, Valuation } from "./types";

let nextId = 1;
const tx = (account_id: number, date: string, type: TxType, pounds: number): Transaction => ({
  id: nextId++,
  account_id,
  date,
  type,
  amount_pence: Math.round(pounds * 100),
  notes: null,
  source: "manual",
  external_ref: null,
});
const val = (account_id: number, date: string, pounds: number): Valuation => ({
  id: nextId++,
  account_id,
  date,
  value_pence: Math.round(pounds * 100),
  source: "manual",
});
const acct = (id: number, type: Account["type"]): Account => ({
  id,
  name: `A${id}`,
  provider: "other",
  type,
  interest_rate: null,
  t212_link: null,
  opened_on: null,
  archived: 0,
  sort_order: id,
});

describe("tax years", () => {
  it("splits on 6 April", () => {
    expect(taxYearOf("2026-04-05")).toBe(2025);
    expect(taxYearOf("2026-04-06")).toBe(2026);
    expect(taxYearOf("2027-01-15")).toBe(2026);
    expect(taxYearLabel(2026)).toBe("2026/27");
  });
});

describe("monthEndsBetween", () => {
  it("lists month ends then the end date", () => {
    expect(monthEndsBetween("2026-04-06", "2026-06-10")).toEqual(["2026-04-30", "2026-05-31", "2026-06-10"]);
    expect(monthEndsBetween("2026-04-06", "2026-04-30")).toEqual(["2026-04-30"]);
  });
});

describe("Ledger", () => {
  it("sums transactions when there are no valuations", () => {
    const l = new Ledger([tx(1, "2026-01-01", "deposit", 100), tx(1, "2026-02-01", "interest", 1), tx(1, "2026-03-01", "withdrawal", 20)], []);
    expect(l.valueAt("2025-12-31")).toBe(0);
    expect(l.valueAt("2026-01-01")).toBe(100_00);
    expect(l.valueAt("2026-03-01")).toBe(81_00);
  });

  it("uses the latest valuation plus later transactions", () => {
    const l = new Ledger(
      [tx(1, "2026-01-01", "deposit", 1000), tx(1, "2026-02-01", "deposit", 500), tx(1, "2026-02-10", "deposit", 100)],
      [val(1, "2026-02-01", 1600)],
    );
    expect(l.valueAt("2026-01-15")).toBe(1000_00); // before any valuation
    expect(l.valueAt("2026-02-01")).toBe(1600_00); // valuation includes same-day deposit
    expect(l.valueAt("2026-02-10")).toBe(1700_00);
  });

  it("computes a time-weighted average balance", () => {
    // £0 for the first 10 days of a 20 day range, then £1,000 => average £500
    const l = new Ledger([tx(1, "2026-01-10", "deposit", 1000)], []);
    expect(l.averageBalance("2026-01-01", "2026-01-20")).toBeCloseTo(500_00, 0);
  });
});

describe("periodStats", () => {
  it("separates contributions, income and market growth", () => {
    const l = new Ledger(
      [tx(1, "2026-04-10", "deposit", 10_000), tx(1, "2026-06-01", "dividend", 50), tx(1, "2026-07-01", "fee", 5)],
      [val(1, "2026-04-10", 10_000), val(1, "2026-09-30", 11_000)],
    );
    const s = periodStats(l, "2026-04-06", "2026-09-30");
    expect(s.startValue).toBe(0);
    expect(s.endValue).toBe(11_000_00);
    expect(s.netContributions).toBe(10_000_00);
    expect(s.growth).toBe(1_000_00);
    expect(s.income).toBe(50_00);
    expect(s.marketGain).toBe(955_00); // 1000 growth - 50 dividend + 5 fee
    expect(s.returnPct).toBeGreaterThan(10);
  });

  it("annualises the effective rate on cash", () => {
    const l = new Ledger([tx(1, "2025-04-05", "deposit", 10_000), tx(1, "2026-04-05", "interest", 400)], []);
    const s = periodStats(l, "2025-04-06", "2026-04-05");
    expect(s.effectiveRate).toBeCloseTo(4, 1);
  });
});

describe("computeDashboard", () => {
  it("tracks ISA, PSA and Premium Bonds", () => {
    const accounts = [acct(1, "cash"), acct(2, "ss_isa"), acct(3, "cash_isa"), acct(4, "premium_bonds")];
    const transactions = [
      tx(1, "2026-05-01", "deposit", 5000),
      tx(1, "2026-06-01", "interest", 20),
      tx(2, "2026-05-01", "deposit", 8000),
      tx(3, "2026-05-01", "transfer_in", 4000),
      tx(3, "2026-06-01", "interest", 15), // ISA interest is tax-free
      tx(4, "2026-04-01", "deposit", 50_000),
      tx(4, "2026-07-01", "prize", 25),
      tx(4, "2026-08-01", "prize", 50),
      tx(1, "2026-03-01", "deposit", 999), // previous tax year
    ];
    const d = computeDashboard({
      accounts,
      transactions,
      valuations: [val(2, "2026-10-31", 8400)],
      settings: { tax_band: "higher", premium_bonds_prize_rate: 3.6 },
      goals: [],
      from: "2026-04-06",
      to: "2026-10-31",
      today: "2026-10-31",
    });
    expect(d.allowances.label).toBe("2026/27");
    expect(d.allowances.isa.used).toBe(12_000_00);
    expect(d.allowances.isa.cashIsaUsed).toBe(4_000_00);
    expect(d.allowances.psa).toEqual({ used: 20_00, limit: 500_00 });
    expect(d.premiumBonds?.prizeCount).toBe(2);
    expect(d.premiumBonds?.prizes).toBe(75_00);
    expect(d.totals.netContributions).toBe(17_000_00);
    expect(d.investments?.growth).toBe(400_00);
    expect(d.series[0].date).toBe("2026-04-05");
    expect(d.monthly.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(d.monthly[1].contributions).toBe(17_000_00);
  });
});
