import type { TxType } from "../shared/types";

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** Accepts YYYY-MM-DD[ time], DD/MM/YYYY[ time] and DD-MM-YYYY. Returns ISO date or null. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[£$€,\s]/g, "");
  if (cleaned === "" || !/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export type Preset = "t212" | "monzo" | "generic";

export interface Mapping {
  date: number;
  amount: number;
  description: number; // -1 = none
  reference: number; // -1 = none
  action: number; // T212 "Action" column, -1 = none
}

export function detectPreset(headers: string[]): { preset: Preset; mapping: Mapping } {
  const idx = (name: string) => headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  if (idx("Action") >= 0 && idx("Time") >= 0 && idx("Total") >= 0) {
    return { preset: "t212", mapping: { date: idx("Time"), amount: idx("Total"), description: idx("Notes"), reference: idx("ID"), action: idx("Action") } };
  }
  if (idx("Transaction ID") >= 0 && idx("Amount") >= 0 && idx("Date") >= 0) {
    return { preset: "monzo", mapping: { date: idx("Date"), amount: idx("Amount"), description: idx("Name"), reference: idx("Transaction ID"), action: -1 } };
  }
  const find = (...names: string[]) => headers.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)));
  return {
    preset: "generic",
    mapping: { date: Math.max(0, find("date", "time")), amount: Math.max(0, find("amount", "value", "total")), description: find("desc", "name", "detail", "reference"), reference: find("id"), action: -1 },
  };
}

/** Trading 212 export actions. Buys, sells and currency conversions move money inside the account, so they're skipped. */
export function t212ActionType(action: string, amountPence: number): TxType | null {
  const a = action.toLowerCase();
  if (a === "deposit") return "deposit";
  if (a === "withdrawal") return "withdrawal";
  if (a.includes("interest")) return "interest";
  if (a.startsWith("dividend")) return "dividend";
  if (a.includes("cashback")) return "bonus";
  if (a.includes("transfer")) return amountPence >= 0 ? "transfer_in" : "transfer_out";
  if (a.includes("fee")) return "fee";
  return null;
}

export function guessType(description: string, amountPence: number): TxType {
  const d = description.toLowerCase();
  if (d.includes("interest")) return "interest";
  if (d.includes("prize")) return "prize";
  if (d.includes("dividend")) return "dividend";
  if (d.includes("cashback") || d.includes("bonus")) return "bonus";
  return amountPence >= 0 ? "deposit" : "withdrawal";
}
