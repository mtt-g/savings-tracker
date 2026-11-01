import dayjs from "dayjs";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbpWhole = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbpCompact = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 });

export const money = (pence: number) => gbp.format(pence / 100);
export const moneyWhole = (pence: number) => gbpWhole.format(pence / 100);
export const moneyCompact = (pence: number) => gbpCompact.format(pence / 100);
export const signedMoney = (pence: number) => (pence > 0 ? "+" : "") + money(pence);

export const pct = (n: number | null | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? "–" : `${n.toFixed(digits)}%`);
export const signedPct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);

export const date = (d: string) => dayjs(d).format("D MMM YYYY");
export const shortDate = (d: string) => dayjs(d).format("D MMM YY");

/** Parses a user-entered pounds amount ("1,234.56", "£20") into pence. Returns null if invalid. */
export function parsePounds(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const penceToInput = (pence: number) => (pence / 100).toFixed(2);

/** Chart axis label: month-end points show as "Apr 26", anything else (period start/end) as "5 Apr 26". */
export const pointLabel = (d: string) => (dayjs(d).add(1, "day").date() === 1 ? dayjs(d).format("MMM YY") : dayjs(d).format("D MMM YY"));

/** Per-share prices can have fractions of a penny (e.g. $186.34357 converted), so allow up to 4 decimal places. Returns pence. */
export function parseUnitPounds(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{0,4})?$/.test(cleaned)) return null;
  return Number(cleaned) * 100;
}

export const unitMoney = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(pence / 100);

export const unitToInput = (pence: number) => String(Number((pence / 100).toFixed(4)));
