import { addDays, daysBetween, maxDate, monthEndsBetween, todayLondon } from "./dates";
import {
  dividendAllowance,
  isaAllowance,
  isTaxableInterest,
  personalSavingsAllowance,
  PREMIUM_BONDS_LIMIT,
  taxYearLabel,
  taxYearOf,
  taxYearRange,
} from "./tax";
import {
  isInvestmentType,
  isIsaType,
  type Account,
  type Goal,
  type Settings,
  type Transaction,
  type TxType,
  type Valuation,
} from "./types";

/** How each transaction type moves an account's balance. */
export const TX_SIGN: Record<TxType, 1 | -1> = {
  deposit: 1,
  withdrawal: -1,
  interest: 1,
  prize: 1,
  dividend: 1,
  bonus: 1,
  fee: -1,
  transfer_in: 1,
  transfer_out: -1,
};

/**
 * How a transaction changes the account balance, in pence. Premium Bond prizes are earnings that are
 * paid out rather than added to the holding, so they are tracked as income but never change the balance.
 * If prizes are reinvested, record that as a deposit.
 */
export const balanceEffect = (t: { type: TxType; amount_pence: number }): number =>
  t.type === "prize" ? 0 : TX_SIGN[t.type] * t.amount_pence;

/** Money moving into or out of an account from outside it, as opposed to money the account earned. */
export const isContribution = (t: TxType) =>
  t === "deposit" || t === "withdrawal" || t === "transfer_in" || t === "transfer_out";

/** Upper bound: index of the first element whose date is > d. */
function upperBound<T extends { date: string }>(arr: T[], d: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].date <= d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Works out an account's balance on any date.
 *
 * The balance at the end of day D is the most recent valuation on or before D plus the net
 * transactions after that valuation, up to and including D. With no valuation, it is the net of
 * all transactions up to D. Valuations are treated as end-of-day, so transactions on the
 * valuation date are already included in it.
 */
export class Ledger {
  readonly txs: Transaction[];
  readonly vals: Valuation[];
  private readonly prefix: number[]; // prefix[i] = net flow of txs[0..i-1]

  constructor(txs: Transaction[], vals: Valuation[]) {
    this.txs = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    this.vals = [...vals].sort((a, b) => a.date.localeCompare(b.date));
    this.prefix = [0];
    for (const t of this.txs) {
      this.prefix.push(this.prefix[this.prefix.length - 1] + balanceEffect(t));
    }
  }

  private flowUpTo(d: string) {
    return this.prefix[upperBound(this.txs, d)];
  }

  valueAt(d: string): number {
    const vi = upperBound(this.vals, d) - 1;
    if (vi < 0) return this.flowUpTo(d);
    const v = this.vals[vi];
    return v.value_pence + this.flowUpTo(d) - this.flowUpTo(v.date);
  }

  txsBetween(from: string, to: string): Transaction[] {
    return this.txs.slice(upperBound(this.txs, addDays(from, -1)), upperBound(this.txs, to));
  }

  /** Time-weighted average balance over [from, to] inclusive. */
  averageBalance(from: string, to: string): number {
    const total = daysBetween(from, to) + 1;
    if (total <= 0) return 0;
    const breaks = new Set<string>();
    for (const t of this.txsBetween(from, to)) breaks.add(t.date);
    for (const v of this.vals) if (v.date >= from && v.date <= to) breaks.add(v.date);
    // Each change takes effect at the end of its day, so balances step on the following day.
    const unique = [...new Set([from, ...[...breaks].map((d) => addDays(d, 1)).filter((d) => d > from && d <= to)])].sort();
    let weighted = 0;
    for (let i = 0; i < unique.length; i++) {
      const segEnd = i + 1 < unique.length ? unique[i + 1] : addDays(to, 1);
      weighted += this.balanceDuring(unique[i]) * daysBetween(unique[i], segEnd);
    }
    return weighted / total;
  }

  /** Balance held during day d, i.e. the end-of-day balance of the previous day. */
  private balanceDuring(d: string) {
    return this.valueAt(addDays(d, -1));
  }
}

export interface FlowTotals {
  deposits: number;
  withdrawals: number;
  transfersIn: number;
  transfersOut: number;
  interest: number;
  prizes: number;
  prizeCount: number;
  dividends: number;
  bonuses: number;
  fees: number;
}

const emptyFlows = (): FlowTotals => ({
  deposits: 0,
  withdrawals: 0,
  transfersIn: 0,
  transfersOut: 0,
  interest: 0,
  prizes: 0,
  prizeCount: 0,
  dividends: 0,
  bonuses: 0,
  fees: 0,
});

function addFlow(f: FlowTotals, t: Transaction) {
  const a = t.amount_pence;
  switch (t.type) {
    case "deposit": f.deposits += a; break;
    case "withdrawal": f.withdrawals += a; break;
    case "transfer_in": f.transfersIn += a; break;
    case "transfer_out": f.transfersOut += a; break;
    case "interest": f.interest += a; break;
    case "prize": f.prizes += a; f.prizeCount++; break;
    case "dividend": f.dividends += a; break;
    case "bonus": f.bonuses += a; break;
    case "fee": f.fees += a; break;
  }
}

function sumFlows(items: FlowTotals[]): FlowTotals {
  const out = emptyFlows();
  for (const f of items) for (const k of Object.keys(out) as (keyof FlowTotals)[]) out[k] += f[k];
  return out;
}

export interface PeriodStats extends FlowTotals {
  startValue: number;
  endValue: number;
  /** Net new money: deposits - withdrawals + transfers in - transfers out. */
  netContributions: number;
  /** Interest + prizes + dividends + bonuses. */
  income: number;
  /** Total gain not explained by contributions: end - start - contributions, plus any prizes paid out. */
  growth: number;
  /** Growth not explained by income or fees, i.e. market movement on investments. */
  marketGain: number;
  /** Modified Dietz return over the period, as a percentage (not annualised). Null if not meaningful. */
  returnPct: number | null;
  averageBalance: number;
  /** (interest + prizes + bonuses) / average balance, annualised, as a percentage. */
  effectiveRate: number | null;
}

/**
 * Modified Dietz return: gain divided by the starting value plus each contribution weighted by the
 * fraction of the period it was invested for. A good approximation of money-weighted return.
 */
function modifiedDietz(
  start: number,
  end: number,
  flows: { date: string; amount: number }[],
  from: string,
  to: string,
): number | null {
  const total = daysBetween(from, to) + 1;
  let net = 0;
  let weighted = 0;
  for (const f of flows) {
    net += f.amount;
    // Flows happen at the end of their day, so they are invested for the days after it.
    weighted += f.amount * (daysBetween(f.date, to) / total);
  }
  const denom = start + weighted;
  if (denom <= 0) return null;
  return ((end - start - net) / denom) * 100;
}

const contributionFlows = (txs: Transaction[]) =>
  txs.filter((t) => isContribution(t.type)).map((t) => ({ date: t.date, amount: TX_SIGN[t.type] * t.amount_pence }));

export function periodStats(ledger: Ledger, from: string, to: string): PeriodStats {
  const txs = ledger.txsBetween(from, to);
  const flows = emptyFlows();
  for (const t of txs) addFlow(flows, t);
  const startValue = ledger.valueAt(addDays(from, -1));
  const endValue = ledger.valueAt(to);
  return finishStats(flows, startValue, endValue, contributionFlows(txs), ledger.averageBalance(from, to), from, to);
}

function finishStats(
  flows: FlowTotals,
  startValue: number,
  endValue: number,
  contribFlows: { date: string; amount: number }[],
  averageBalance: number,
  from: string,
  to: string,
): PeriodStats {
  const netContributions = flows.deposits - flows.withdrawals + flows.transfersIn - flows.transfersOut;
  const income = flows.interest + flows.prizes + flows.dividends + flows.bonuses;
  // Prizes are paid out, so they sit outside the balance but still count towards total growth.
  const growth = endValue - startValue - netContributions + flows.prizes;
  const days = daysBetween(from, to) + 1;
  const earned = flows.interest + flows.prizes + flows.bonuses;
  return {
    ...flows,
    startValue,
    endValue,
    netContributions,
    income,
    growth,
    marketGain: growth - income + flows.fees,
    returnPct: modifiedDietz(startValue, endValue + flows.prizes, contribFlows, from, to),
    averageBalance,
    effectiveRate: averageBalance > 0 ? (earned / averageBalance) * (365 / days) * 100 : null,
  };
}

export interface AccountPeriod {
  account: Account;
  stats: PeriodStats;
}

export interface SeriesPoint {
  date: string;
  values: Record<number, number>;
}

export interface MonthlyFlow {
  month: string; // YYYY-MM
  contributions: number;
  income: number;
}

export interface Allowances {
  taxYear: number;
  label: string;
  isa: { used: number; cashIsaUsed: number; limit: number; cashIsaLimit: number | null };
  psa: { used: number; limit: number };
  dividends: { used: number; limit: number };
}

export interface PremiumBondsSummary {
  holding: number;
  limit: number;
  prizes: number;
  prizeCount: number;
  averageHolding: number;
  effectiveRate: number | null;
  advertisedRate: number;
}

export interface GoalProgress {
  goal: Goal;
  current: number;
}

export interface Dashboard {
  from: string;
  to: string;
  totals: PeriodStats;
  investments: PeriodStats | null;
  accounts: AccountPeriod[];
  series: SeriesPoint[];
  monthly: MonthlyFlow[];
  allowances: Allowances;
  premiumBonds: PremiumBondsSummary | null;
  goals: GoalProgress[];
  /** Pension accounts, always summarised here; they're only in the figures above when includePensions is set. */
  pensions: PensionSummary | null;
}

export interface PensionSummary {
  stats: PeriodStats;
  accounts: AccountPeriod[];
  series: { date: string; value: number }[];
}

export interface DashboardInput {
  accounts: Account[];
  transactions: Transaction[];
  valuations: Valuation[];
  settings: Settings;
  goals: Goal[];
  from: string;
  to: string;
  today?: string;
  /** Pensions are locked away, so by default they're left out of the totals, charts and account table. */
  includePensions?: boolean;
}

function aggregate(items: AccountPeriod[], ledgers: Map<number, Ledger>, from: string, to: string): PeriodStats {
  const flows = sumFlows(items.map((i) => i.stats));
  const contrib = items.flatMap((i) => contributionFlows(ledgers.get(i.account.id)!.txsBetween(from, to)));
  const sum = (k: "startValue" | "endValue" | "averageBalance") => items.reduce((s, i) => s + i.stats[k], 0);
  return finishStats(flows, sum("startValue"), sum("endValue"), contrib, sum("averageBalance"), from, to);
}

export function buildLedgers(accounts: Account[], transactions: Transaction[], valuations: Valuation[]) {
  const ledgers = new Map<number, Ledger>();
  for (const a of accounts) {
    ledgers.set(
      a.id,
      new Ledger(
        transactions.filter((t) => t.account_id === a.id),
        valuations.filter((v) => v.account_id === a.id),
      ),
    );
  }
  return ledgers;
}

export function computeDashboard(input: DashboardInput): Dashboard {
  const { accounts, transactions, valuations, settings, goals, from, to } = input;
  const today = input.today ?? todayLondon();
  const ledgers = buildLedgers(accounts, transactions, valuations);

  const perAccount: AccountPeriod[] = accounts.map((account) => ({
    account,
    stats: periodStats(ledgers.get(account.id)!, from, to),
  }));
  // Hide archived accounts that had nothing happen in this period.
  const visible = perAccount.filter(
    (p) => !p.account.archived || p.stats.startValue !== 0 || p.stats.endValue !== 0 || p.stats.netContributions !== 0,
  );

  const pensionAccounts = visible.filter((p) => p.account.type === "pension");
  const shown = input.includePensions ? visible : visible.filter((p) => p.account.type !== "pension");
  const investmentAccounts = shown.filter((p) => isInvestmentType(p.account.type));
  const totals = aggregate(shown, ledgers, from, to);

  // Balance over time: one point before the period starts, then every month end.
  const seriesDates = [addDays(from, -1), ...monthEndsBetween(from, to)];
  const series = seriesDates.map((date) => ({
    date,
    values: Object.fromEntries(shown.map((p) => [p.account.id, ledgers.get(p.account.id)!.valueAt(date)])),
  }));

  const monthlyMap = new Map<string, MonthlyFlow>();
  for (const d of monthEndsBetween(from, to)) {
    const month = d.slice(0, 7);
    monthlyMap.set(month, { month, contributions: 0, income: 0 });
  }
  for (const p of shown) {
    for (const t of ledgers.get(p.account.id)!.txsBetween(from, to)) {
      const m = monthlyMap.get(t.date.slice(0, 7));
      if (!m) continue;
      if (isContribution(t.type)) m.contributions += TX_SIGN[t.type] * t.amount_pence;
      else if (t.type !== "fee") m.income += t.amount_pence;
    }
  }

  // Allowances are for the tax year containing the end of the selected range.
  const ty = taxYearOf(to);
  const tyRange = taxYearRange(ty);
  const isa = isaAllowance(ty);
  const allowances: Allowances = {
    taxYear: ty,
    label: taxYearLabel(ty),
    isa: { used: 0, cashIsaUsed: 0, limit: isa.total, cashIsaLimit: isa.cashIsaLimit },
    psa: { used: 0, limit: personalSavingsAllowance(settings.tax_band) },
    dividends: { used: 0, limit: dividendAllowance(ty) },
  };
  for (const a of accounts) {
    for (const t of ledgers.get(a.id)!.txsBetween(tyRange.from, tyRange.to)) {
      if (isIsaType(a.type) && (t.type === "deposit" || t.type === "transfer_in")) {
        allowances.isa.used += t.amount_pence;
        if (a.type === "cash_isa") allowances.isa.cashIsaUsed += t.amount_pence;
      }
      if (isTaxableInterest(a.type) && (t.type === "interest" || t.type === "bonus")) allowances.psa.used += t.amount_pence;
      if (a.type === "gia" && t.type === "dividend") allowances.dividends.used += t.amount_pence;
    }
  }

  const pb = visible.filter((p) => p.account.type === "premium_bonds");
  let premiumBonds: PremiumBondsSummary | null = null;
  if (pb.length) {
    const s = aggregate(pb, ledgers, from, to);
    premiumBonds = {
      holding: s.endValue,
      limit: PREMIUM_BONDS_LIMIT,
      prizes: s.prizes,
      prizeCount: s.prizeCount,
      averageHolding: s.averageBalance,
      effectiveRate: s.effectiveRate,
      advertisedRate: settings.premium_bonds_prize_rate,
    };
  }

  const currentTy = taxYearRange(taxYearOf(today));
  const goalProgress = goals.map((goal) => {
    const ids = goal.account_ids ?? accounts.filter((a) => a.type !== "pension").map((a) => a.id);
    let current = 0;
    for (const id of ids) {
      const l = ledgers.get(id);
      if (!l) continue;
      if (goal.kind === "balance") current += l.valueAt(today);
      else current += periodStats(l, currentTy.from, today).netContributions;
    }
    return { goal, current };
  });

  return {
    from,
    to,
    totals,
    investments: investmentAccounts.length ? aggregate(investmentAccounts, ledgers, from, to) : null,
    accounts: shown,
    series,
    monthly: [...monthlyMap.values()],
    allowances,
    premiumBonds,
    goals: goalProgress,
    pensions: pensionAccounts.length
      ? {
          stats: aggregate(pensionAccounts, ledgers, from, to),
          accounts: pensionAccounts,
          series: seriesDates.map((date) => ({
            date,
            value: pensionAccounts.reduce((s, p) => s + ledgers.get(p.account.id)!.valueAt(date), 0),
          })),
        }
      : null,
  };
}

/** Balance history for one account: a point at every month end since its first activity, plus today. */
export function accountHistory(ledger: Ledger, today: string): { date: string; value: number }[] {
  const first = [ledger.txs[0]?.date, ledger.vals[0]?.date].filter(Boolean).sort()[0];
  if (!first) return [];
  const start = maxDate(first, addDays(today, -365 * 10));
  return [addDays(start, -1), ...monthEndsBetween(start, today)].map((date) => ({ date, value: ledger.valueAt(date) }));
}
