import { describe, expect, it } from "vitest";
import { mapDividend, mapOrder, mapTransaction } from "./t212";

describe("Trading 212 mapping", () => {
  it("maps cash movements and interest", () => {
    expect(mapTransaction({ type: "DEPOSIT", amount: 500, currency: "GBP", dateTime: "2026-06-30T23:30:00Z", reference: "a" })).toEqual({
      date: "2026-07-01", // 23:30 UTC is 00:30 in London (BST)
      type: "deposit",
      amount_pence: 50000,
      notes: null,
      external_ref: "tx:a",
    });
    expect(mapTransaction({ type: "WITHDRAW", amount: -20.5, currency: "GBP", dateTime: "2026-01-10T10:00:00Z", reference: "b" })?.amount_pence).toBe(2050);
    expect(mapTransaction({ type: "INTEREST_ON_FREE_CASH", amount: 1.23, currency: "GBP", dateTime: "2026-01-10T10:00:00Z", reference: "c" })?.type).toBe("interest");
    expect(mapTransaction({ type: "TRANSFER", amount: -100, currency: "GBP", dateTime: "2026-01-10T10:00:00Z", reference: "d" })?.type).toBe("transfer_out");
    expect(mapTransaction({ type: "SOMETHING_NEW", amount: 1, currency: "GBP", dateTime: "2026-01-10T10:00:00Z", reference: "e" })).toBeNull();
    expect(mapTransaction({ type: "DEPOSIT", amount: 1, currency: "EUR", dateTime: "2026-01-10T10:00:00Z", reference: "f" })).toBeNull();
  });

  it("maps dividends", () => {
    const d = mapDividend({ amount: 3.21, currency: "GBP", paidOn: "2026-03-01T12:00:00Z", quantity: 10, reference: "x", ticker: "VUSAl_EQ", type: "ORDINARY" });
    expect(d).toMatchObject({ date: "2026-03-01", type: "dividend", amount_pence: 321, external_ref: "div:x" });
  });

  it("maps buys and sells from order history", () => {
    const buy = mapOrder({
      order: { id: 1, side: "BUY", ticker: "VUAGl_EQ", instrument: { ticker: "VUAGl_EQ", name: "Vanguard S&P 500", isin: "IE00BFMXXD54", currency: "GBX" } },
      fill: { id: 99, filledAt: "2026-06-30T23:30:00Z", price: 8123.5, quantity: 2.5, type: "TRADE",
        walletImpact: { currency: "GBP", netValue: 203.09, realisedProfitLoss: 0, taxes: [{ name: "STAMP_DUTY", quantity: 1.02, currency: "GBP" }] } },
    });
    expect(buy).toMatchObject({ date: "2026-07-01", side: "buy", kind: "TRADE", ticker: "VUAGl_EQ", quantity: 2.5, price: 8123.5, value_pence: 20309, fees_pence: 102, external_ref: "fill:99" });

    // Sells can carry a negative quantity.
    const sell = mapOrder({
      order: { id: 2, side: "SELL", ticker: "FLUT_US_EQ", instrument: { ticker: "FLUT_US_EQ", name: "Flutter", currency: "USD" } },
      fill: { id: 100, filledAt: "2026-01-10T10:00:00Z", price: 190, quantity: -20, walletImpact: { currency: "GBP", netValue: 2850, realisedProfitLoss: -120.5 } },
    });
    expect(sell).toMatchObject({ side: "sell", quantity: 20, value_pence: 285000, realised_pl_pence: -12050, fees_pence: 0 });

    // Unfilled orders and foreign-currency wallet amounts.
    expect(mapOrder({ order: { id: 3, side: "BUY", ticker: "X" } })).toBeNull();
    const eur = mapOrder({ order: { id: 4, side: "BUY", ticker: "Y" }, fill: { id: 5, filledAt: "2026-01-10T10:00:00Z", quantity: 1, walletImpact: { currency: "EUR", netValue: 10 } } });
    expect(eur?.value_pence).toBeNull();
  });
});
