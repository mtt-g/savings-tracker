import type { Holding, ShareLot } from "./types";

export type ValueSource = "holding" | "account";

export interface LotComparison {
  lot: ShareLot;
  /** What you paid in total, in pence. */
  paid: number;
  /** Market value on the day you acquired them (the tax base cost), or null if unknown. */
  marketCost: number | null;
  /** Worth now, or null if it can't be priced. */
  currentValue: number | null;
  valueSource: ValueSource | null;
  /** marketCost - paid: what the scheme discount was worth when you got the shares. */
  discount: number | null;
  /** currentValue - paid */
  gainVsPaid: number | null;
  /** currentValue - marketCost: the gain or loss for capital gains tax outside an ISA. */
  gainVsMarket: number | null;
}

export interface LotContext {
  /** Latest synced holdings snapshot for every account. */
  holdings: Holding[];
  /** Current balance by account id, in pence. */
  balances: Map<number, number>;
}

const round = Math.round;

/**
 * Prices each lot.
 * - A lot with a ticker that matches a synced holding, in its own account or any other, uses that holding's value
 *   per share.
 * - Otherwise, in an account with no synced holdings (for example an EquatePlus share plan account that holds
 *   one stock), the account balance left after matched lots is shared out between the remaining lots by quantity.
 * - Otherwise the lot can't be priced and shows cost only.
 */
export function compareLots(lots: ShareLot[], ctx: LotContext): LotComparison[] {
  const priced = new Map<number, { value: number; source: ValueSource }>();

  const byAccount = new Map<number, ShareLot[]>();
  for (const lot of lots) byAccount.set(lot.account_id, [...(byAccount.get(lot.account_id) ?? []), lot]);

  for (const [accountId, accountLots] of byAccount) {
    const synced = ctx.holdings.filter((h) => h.account_id === accountId);
    let matchedValue = 0;
    const unmatched: ShareLot[] = [];
    for (const lot of accountLots) {
      // Prefer the lot's own account, but the same stock held in another account prices it just as well (for
      // example EquatePlus shares that are also held in a Trading 212 ISA).
      const h = lot.ticker
        ? (synced.find((x) => x.ticker === lot.ticker && x.quantity > 0) ??
          ctx.holdings.find((x) => x.ticker === lot.ticker && x.quantity > 0))
        : undefined;
      if (h) {
        const value = round((lot.quantity * h.value_pence) / h.quantity);
        priced.set(lot.id, { value, source: "holding" });
        matchedValue += value;
      } else unmatched.push(lot);
    }
    const balance = ctx.balances.get(accountId) ?? 0;
    const remaining = balance - matchedValue;
    const quantity = unmatched.reduce((s, l) => s + l.quantity, 0);
    if (!synced.length && unmatched.length && remaining > 0 && quantity > 0) {
      for (const lot of unmatched) priced.set(lot.id, { value: round((remaining * lot.quantity) / quantity), source: "account" });
    }
  }

  return lots.map((lot) => {
    const paid = round(lot.quantity * lot.paid_per_share_pence);
    const marketCost = lot.market_per_share_pence == null ? null : round(lot.quantity * lot.market_per_share_pence);
    const p = priced.get(lot.id);
    const currentValue = p?.value ?? null;
    return {
      lot,
      paid,
      marketCost,
      currentValue,
      valueSource: p?.source ?? null,
      discount: marketCost == null ? null : marketCost - paid,
      gainVsPaid: currentValue == null ? null : currentValue - paid,
      gainVsMarket: currentValue == null || marketCost == null ? null : currentValue - marketCost,
    };
  });
}

export interface LotTotals {
  shares: number;
  paid: number;
  /** Each total below only counts lots where that figure is known, so comparisons stay like for like. */
  marketCost: number;
  currentValue: number;
  discount: number;
  gainVsPaid: number;
  gainVsMarket: number;
  lotsWithoutMarketPrice: number;
  lotsWithoutValue: number;
}

export function totalLots(items: LotComparison[]): LotTotals {
  const t: LotTotals = {
    shares: 0, paid: 0, marketCost: 0, currentValue: 0, discount: 0, gainVsPaid: 0, gainVsMarket: 0,
    lotsWithoutMarketPrice: 0, lotsWithoutValue: 0,
  };
  for (const c of items) {
    t.shares += c.lot.quantity;
    t.paid += c.paid;
    if (c.marketCost == null) t.lotsWithoutMarketPrice++;
    else t.marketCost += c.marketCost;
    if (c.currentValue == null) t.lotsWithoutValue++;
    else t.currentValue += c.currentValue;
    if (c.discount != null) t.discount += c.discount;
    if (c.gainVsPaid != null) t.gainVsPaid += c.gainVsPaid;
    if (c.gainVsMarket != null) t.gainVsMarket += c.gainVsMarket;
  }
  return t;
}
