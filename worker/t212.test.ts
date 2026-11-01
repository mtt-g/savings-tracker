import { describe, expect, it } from "vitest";
import { mapDividend, mapTransaction } from "./t212";

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
});
