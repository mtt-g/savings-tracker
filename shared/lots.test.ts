import { describe, expect, it } from "vitest";
import { compareLots, totalLots } from "./lots";
import type { Holding, ShareLot } from "./types";

const lot = (id: number, account_id: number, o: Partial<ShareLot> = {}): ShareLot => ({
  id, account_id, name: `Lot ${id}`, ticker: null, acquired_on: "2024-04-16", quantity: 72,
  paid_per_share_pence: 9875, market_per_share_pence: 14985, notes: null, ...o,
});
const holding = (account_id: number, ticker: string, quantity: number, value_pence: number): Holding => ({
  id: 1, account_id, date: "2026-11-01", ticker, isin: null, name: null, currency: "USD", quantity,
  avg_price: null, current_price: null, value_pence, cost_pence: null,
});

describe("compareLots", () => {
  it("compares paid, market cost and current value", () => {
    // 72 shares paid £98.75, worth £149.85 each when acquired, £4,442.91 now (account holds only these)
    const [c] = compareLots([lot(1, 1)], { holdings: [], balances: new Map([[1, 444291]]) });
    expect(c.paid).toBe(711000);
    expect(c.marketCost).toBe(1078920);
    expect(c.currentValue).toBe(444291);
    expect(c.valueSource).toBe("account");
    expect(c.discount).toBe(367920);
    expect(c.gainVsPaid).toBe(444291 - 711000);
    expect(c.gainVsMarket).toBe(444291 - 1078920);
  });

  it("splits an account balance across lots by quantity", () => {
    const lots = [lot(1, 1, { quantity: 72 }), lot(2, 1, { quantity: 4, paid_per_share_pence: 0, market_per_share_pence: null })];
    const [a, b] = compareLots(lots, { holdings: [], balances: new Map([[1, 468973]]) });
    expect(a.currentValue! + b.currentValue!).toBe(468973);
    expect(b.currentValue).toBe(Math.round((468973 * 4) / 76));
    expect(b.paid).toBe(0);
    expect(b.marketCost).toBeNull();
    expect(b.gainVsMarket).toBeNull();
  });

  it("prices a lot from a matching synced holding and ignores the balance in synced accounts", () => {
    const ctx = { holdings: [holding(2, "FLUT_US_EQ", 76, 468973), holding(2, "VUSA_EQ", 10, 100000)], balances: new Map([[2, 568973]]) };
    const [matched, unmatched] = compareLots(
      [lot(1, 2, { ticker: "FLUT_US_EQ", quantity: 76, paid_per_share_pence: 11596, market_per_share_pence: 21320 }), lot(2, 2, { ticker: null })],
      ctx,
    );
    expect(matched.valueSource).toBe("holding");
    expect(matched.currentValue).toBe(468973);
    expect(unmatched.currentValue).toBeNull();
    expect(unmatched.valueSource).toBeNull();
  });

  it("totals only count lots where each figure is known", () => {
    const items = compareLots(
      [lot(1, 1, { quantity: 72 }), lot(2, 1, { quantity: 4, paid_per_share_pence: 0, market_per_share_pence: null })],
      { holdings: [], balances: new Map([[1, 468973]]) },
    );
    const t = totalLots(items);
    expect(t.shares).toBe(76);
    expect(t.paid).toBe(711000);
    expect(t.lotsWithoutMarketPrice).toBe(1);
    expect(t.marketCost).toBe(1078920);
    expect(t.currentValue).toBe(468973);
    expect(t.gainVsMarket).toBe(items[0].currentValue! - 1078920);
  });
});
