export const ACCOUNT_TYPES = ["cash", "cash_isa", "ss_isa", "gia", "premium_bonds"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PROVIDERS = ["monzo", "nsandi", "trading212", "other"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const TX_TYPES = [
  "deposit",
  "withdrawal",
  "interest",
  "prize",
  "dividend",
  "bonus",
  "fee",
  "transfer_in",
  "transfer_out",
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const T212_LINKS = ["invest", "isa"] as const;
export type T212Link = (typeof T212_LINKS)[number];

export type TaxBand = "basic" | "higher" | "additional";

export interface Account {
  id: number;
  name: string;
  provider: Provider;
  type: AccountType;
  interest_rate: number | null;
  t212_link: T212Link | null;
  opened_on: string | null;
  archived: number;
  sort_order: number;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  type: TxType;
  amount_pence: number;
  notes: string | null;
  source: string;
  external_ref: string | null;
}

export interface Valuation {
  id: number;
  account_id: number;
  date: string;
  value_pence: number;
  source: string;
}

export interface Holding {
  id: number;
  account_id: number;
  date: string;
  ticker: string;
  isin: string | null;
  name: string | null;
  currency: string | null;
  quantity: number;
  avg_price: number | null;
  current_price: number | null;
  value_pence: number;
  cost_pence: number | null;
}

export interface Goal {
  id: number;
  name: string;
  kind: "balance" | "yearly_savings";
  target_pence: number;
  target_date: string | null;
  account_ids: number[] | null;
}

export interface Settings {
  tax_band: TaxBand;
  premium_bonds_prize_rate: number;
}

export interface SyncRun {
  id: number;
  account_id: number | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  message: string | null;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash savings",
  cash_isa: "Cash ISA",
  ss_isa: "Stocks & Shares ISA",
  gia: "Investment account (GIA)",
  premium_bonds: "Premium Bonds",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  monzo: "Monzo",
  nsandi: "NS&I",
  trading212: "Trading 212",
  other: "Other",
};

export const TX_TYPE_LABELS: Record<TxType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  interest: "Interest",
  prize: "Prize",
  dividend: "Dividend",
  bonus: "Bonus / cashback",
  fee: "Fee",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

export const isInvestmentType = (t: AccountType) => t === "ss_isa" || t === "gia";
export const isIsaType = (t: AccountType) => t === "ss_isa" || t === "cash_isa";

export interface ShareLot {
  id: number;
  account_id: number;
  name: string;
  ticker: string | null;
  acquired_on: string;
  quantity: number;
  /** What you actually paid, in pence per share (fractions allowed). */
  paid_per_share_pence: number;
  /** Market price on the day you acquired them, in pence per share. This is normally the tax base cost. Null if unknown. */
  market_per_share_pence: number | null;
  notes: string | null;
}

export interface Trade {
  id: number;
  account_id: number;
  date: string;
  side: "buy" | "sell";
  /** "TRADE", or a corporate action such as "STOCK_SPLIT". */
  kind: string;
  ticker: string;
  name: string | null;
  isin: string | null;
  currency: string | null;
  quantity: number;
  /** Per share, in the instrument's currency. */
  price: number | null;
  /** Net value in pence in the account currency. */
  value_pence: number | null;
  fees_pence: number;
  realised_pl_pence: number | null;
  source: string;
  external_ref: string;
}
