/** Date helpers working on ISO 'YYYY-MM-DD' strings, using UTC arithmetic so there are no DST surprises. */

const DAY_MS = 86_400_000;

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS);

/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** Today's date in the UK, regardless of where the code runs. */
export function todayLondon(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Converts an ISO timestamp to the UK calendar date it falls on. */
export const londonDateOf = (iso: string) => todayLondon(new Date(iso));

export function endOfMonth(d: string): string {
  const [y, m] = d.split("-").map(Number);
  return fromMs(Date.UTC(y, m, 0));
}

/** Month-end dates strictly inside (from, to), followed by `to` itself. */
export function monthEndsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = endOfMonth(from);
  while (cur < to) {
    out.push(cur);
    cur = endOfMonth(addDays(cur, 1));
  }
  out.push(to);
  return out;
}

export const minDate = (a: string, b: string) => (a < b ? a : b);
export const maxDate = (a: string, b: string) => (a > b ? a : b);
