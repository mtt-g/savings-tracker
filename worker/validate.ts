import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { ACCOUNT_TYPES, PROVIDERS, T212_LINKS, TX_TYPES } from "../shared/types";

export function parse<T extends z.ZodType>(schema: T, data: unknown, label = "body"): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HTTPException(400, { message: r.error.issues.map((i) => `${i.path.join(".") || label}: ${i.message}`).join("; ") });
  }
  return r.data;
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "not a real date");
const pence = z.number().int();

export const accountInput = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(PROVIDERS),
  type: z.enum(ACCOUNT_TYPES),
  interest_rate: z.number().min(0).max(100).nullable().default(null),
  t212_link: z.enum(T212_LINKS).nullable().default(null),
  opened_on: isoDate.nullable().default(null),
  archived: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const transactionInput = z.object({
  account_id: z.number().int(),
  date: isoDate,
  type: z.enum(TX_TYPES),
  amount_pence: pence.min(0),
  notes: z.string().max(500).nullable().default(null),
});

export const bulkTransactionInput = z.object({
  account_id: z.number().int(),
  source: z.enum(["csv"]).default("csv"),
  rows: z
    .array(
      z.object({
        date: isoDate,
        type: z.enum(TX_TYPES),
        amount_pence: pence.min(0),
        notes: z.string().max(500).nullable().default(null),
        external_ref: z.string().max(200),
      }),
    )
    .max(5000),
});

export const valuationInput = z.object({
  account_id: z.number().int(),
  date: isoDate,
  value_pence: pence,
});

export const settingsInput = z.object({
  tax_band: z.enum(["basic", "higher", "additional"]),
  premium_bonds_prize_rate: z.number().min(0).max(20),
});

export const goalInput = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["balance", "yearly_savings"]),
  target_pence: pence.min(1),
  target_date: isoDate.nullable().default(null),
  account_ids: z.array(z.number().int()).nullable().default(null),
});

export const shareLotInput = z.object({
  account_id: z.number().int(),
  name: z.string().trim().min(1).max(100),
  ticker: z.string().trim().max(50).nullable().default(null),
  acquired_on: isoDate,
  quantity: z.number().positive().max(1e9),
  paid_per_share_pence: z.number().min(0).max(1e9),
  market_per_share_pence: z.number().min(0).max(1e9).nullable().default(null),
  notes: z.string().max(500).nullable().default(null),
});
