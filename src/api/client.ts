import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dashboard, PeriodStats } from "../../shared/calc";
import type { LotComparison } from "../../shared/lots";
import type { Account, Goal, Holding, Settings, ShareLot, SyncRun, Transaction, TxType, Valuation } from "../../shared/types";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? res.statusText);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: (path: string) => request<void>("DELETE", path),
};

export interface AccountSummary extends Account {
  balance: number;
  lastValuation: string | null;
  taxYear: PeriodStats;
  lastSync: SyncRun | null;
  t212Configured: boolean | null;
}

export interface AccountDetail {
  account: Account;
  balance: number;
  history: { date: string; value: number }[];
  allTime: PeriodStats | null;
  valuations: Valuation[];
  holdings: Holding[];
  holdingsDate: string | null;
}

export type AccountInput = Omit<Account, "id" | "archived"> & { archived: boolean };
export type TransactionInput = Pick<Transaction, "account_id" | "date" | "type" | "amount_pence" | "notes">;
export type GoalInput = Omit<Goal, "id">;
export type ShareLotInput = Omit<ShareLot, "id">;

export interface TransactionFilters {
  account_id?: number;
  type?: TxType;
  from?: string;
  to?: string;
}

const qs = (o: object) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const useDashboard = (from: string, to: string) =>
  useQuery({
    queryKey: ["dashboard", from, to],
    queryFn: () => api.get<Dashboard>(`/dashboard${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api.get<AccountSummary[]>("/accounts") });

export const useAccount = (id: number) =>
  useQuery({ queryKey: ["accounts", id], queryFn: () => api.get<AccountDetail>(`/accounts/${id}`) });

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => api.get<Transaction[]>(`/transactions${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useShareLots = () => useQuery({ queryKey: ["share-lots"], queryFn: () => api.get<LotComparison[]>("/share-lots") });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
export const useGoals = () => useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/goals") });
export const useSyncRuns = () => useQuery({ queryKey: ["sync-runs"], queryFn: () => api.get<SyncRun[]>("/sync-runs") });

/** Wraps a mutation so that, on success, every cached query is refetched (the data set is tiny). */
export function useApiMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
