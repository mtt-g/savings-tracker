import type { AccountType, TaxBand } from "./types";

/**
 * UK tax year helpers. A tax year is identified by the calendar year it starts in:
 * tax year 2026 = 6 April 2026 to 5 April 2027, shown as "2026/27".
 */

export function taxYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return date.slice(5) >= "04-06" ? year : year - 1;
}

export const taxYearRange = (startYear: number) => ({
  from: `${startYear}-04-06`,
  to: `${startYear + 1}-04-05`,
});

export const taxYearLabel = (startYear: number) =>
  `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;

/**
 * ISA allowance in pence. From 6 April 2027 the Cash ISA limit is £12,000 within the overall £20,000
 * for under-65s (announced in the November 2025 Budget).
 */
export function isaAllowance(startYear: number): { total: number; cashIsaLimit: number | null } {
  return { total: 20_000_00, cashIsaLimit: startYear >= 2027 ? 12_000_00 : null };
}

/** Personal Savings Allowance in pence. */
export function personalSavingsAllowance(band: TaxBand): number {
  return { basic: 1_000_00, higher: 500_00, additional: 0 }[band];
}

/** Dividend allowance in pence (outside ISAs). */
export const dividendAllowance = (startYear: number) => (startYear >= 2024 ? 500_00 : startYear === 2023 ? 1_000_00 : 2_000_00);

/** Capital gains tax annual exempt amount in pence. */
export const cgtAllowance = (startYear: number) => (startYear >= 2024 ? 3_000_00 : startYear === 2023 ? 6_000_00 : 12_300_00);

export const PREMIUM_BONDS_LIMIT = 50_000_00;

/** Interest from these accounts counts towards the Personal Savings Allowance. */
export const isTaxableInterest = (type: AccountType) => type === "cash" || type === "gia";
