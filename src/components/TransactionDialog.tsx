import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { TX_TYPE_LABELS, TX_TYPES, type AccountType, type Transaction, type TxType } from "../../shared/types";
import { api, useAccounts, useApiMutation, type TransactionInput } from "../api/client";
import { parsePounds, penceToInput } from "../format";
import { ErrorAlert } from "./ErrorAlert";
import { MoneyField } from "./MoneyField";

/** The transaction types that make sense for each kind of account, most common first. */
const TYPES_FOR: Record<AccountType, TxType[]> = {
  cash: ["deposit", "withdrawal", "interest", "bonus", "transfer_in", "transfer_out", "fee"],
  cash_isa: ["deposit", "withdrawal", "interest", "bonus", "transfer_in", "transfer_out", "fee"],
  premium_bonds: ["deposit", "withdrawal", "prize", "transfer_in", "transfer_out"],
  ss_isa: ["deposit", "withdrawal", "dividend", "interest", "fee", "bonus", "transfer_in", "transfer_out"],
  pension: ["deposit", "withdrawal", "fee", "bonus", "transfer_in", "transfer_out"],
  gia: ["deposit", "withdrawal", "dividend", "interest", "fee", "bonus", "transfer_in", "transfer_out"],
};

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction;
  defaultAccountId?: number;
}

export function TransactionDialog({ open, onClose, transaction, defaultAccountId }: Props) {
  const { data: accounts = [] } = useAccounts();
  const active = accounts.filter((a) => !a.archived || a.id === transaction?.account_id);
  const [accountId, setAccountId] = useState<number | "">("");
  const [type, setType] = useState<TxType>("deposit");
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setAccountId(transaction?.account_id ?? defaultAccountId ?? "");
    setType(transaction?.type ?? "deposit");
    setDate(transaction ? dayjs(transaction.date) : dayjs());
    setAmount(transaction ? penceToInput(transaction.amount_pence) : "");
    setNotes(transaction?.notes ?? "");
  }, [open, transaction, defaultAccountId]);

  const account = accounts.find((a) => a.id === accountId);
  const typeOptions = account ? TYPES_FOR[account.type] : TX_TYPES;
  const pence = parsePounds(amount);

  const save = useApiMutation((body: TransactionInput) =>
    transaction ? api.put(`/transactions/${transaction.id}`, body) : api.post("/transactions", body),
  );
  const remove = useApiMutation(() => api.delete(`/transactions/${transaction!.id}`));

  const valid = accountId !== "" && date?.isValid() && pence !== null && pence > 0;

  const submit = () => {
    if (!valid) return;
    save.mutate(
      { account_id: accountId as number, type, date: date!.format("YYYY-MM-DD"), amount_pence: pence!, notes: notes.trim() || null },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => { save.reset(); remove.reset(); } } }}>
      <DialogTitle>{transaction ? "Edit transaction" : "Add transaction"}</DialogTitle>
      <DialogContent>
        <ErrorAlert error={save.error ?? remove.error} />
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Account" value={accountId} onChange={(e) => {
            const id = Number(e.target.value);
            setAccountId(id);
            const a = accounts.find((x) => x.id === id);
            if (a && !TYPES_FOR[a.type].includes(type)) setType(TYPES_FOR[a.type][0]);
          }}>
            {active.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            {typeOptions.map((t) => (
              <MenuItem key={t} value={t}>{TX_TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>
          <DatePicker label="Date" value={date} onChange={setDate} disableFuture format="DD/MM/YYYY" slotProps={{ textField: { size: "small", fullWidth: true } }} />
          <MoneyField label="Amount" value={amount} onChange={setAmount} autoFocus={!transaction}
            error={amount !== "" && (pence === null || pence <= 0)}
            helperText={
              type === "prize"
                ? "Counts as earnings only. It doesn't change the balance, so add a deposit too if you reinvest it"
                : account?.t212_link && !transaction
                  ? "Synced from Trading 212 automatically, so only add things the sync misses"
                  : undefined
            } />
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline maxRows={3} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {transaction && (
          <Button color="error" sx={{ mr: "auto" }} disabled={remove.isPending}
            onClick={() => window.confirm("Delete this transaction?") && remove.mutate(undefined, { onSuccess: onClose })}>
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!valid || save.isPending}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
