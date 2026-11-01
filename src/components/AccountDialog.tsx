import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  PROVIDER_LABELS,
  PROVIDERS,
  type Account,
  type AccountType,
  type Provider,
  type T212Link,
} from "../../shared/types";
import { api, useApiMutation, type AccountInput } from "../api/client";
import { ErrorAlert } from "./ErrorAlert";

export function AccountDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("other");
  const [type, setType] = useState<AccountType>("cash");
  const [rate, setRate] = useState("");
  const [link, setLink] = useState<T212Link | "">("");
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setProvider(account?.provider ?? "other");
    setType(account?.type ?? "cash");
    setRate(account?.interest_rate != null ? String(account.interest_rate) : "");
    setLink(account?.t212_link ?? "");
    setArchived(!!account?.archived);
  }, [open, account]);

  const save = useApiMutation((body: AccountInput) => (account ? api.put(`/accounts/${account.id}`, body) : api.post("/accounts", body)));
  const remove = useApiMutation(() => api.delete(`/accounts/${account!.id}`));

  const rateNum = rate.trim() === "" ? null : Number(rate);
  const valid = name.trim() !== "" && (rateNum === null || (Number.isFinite(rateNum) && rateNum >= 0));
  const canLink = provider === "trading212" && (type === "gia" || type === "ss_isa");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => { save.reset(); remove.reset(); } } }}>
      <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
      <DialogContent>
        <ErrorAlert error={save.error ?? remove.error} />
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {PROVIDERS.map((p) => <MenuItem key={p} value={p}>{PROVIDER_LABELS[p]}</MenuItem>)}
          </TextField>
          <TextField select label="Account type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <MenuItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</MenuItem>)}
          </TextField>
          {(type === "cash" || type === "cash_isa") && (
            <TextField label="Interest rate (AER %)" value={rate} onChange={(e) => setRate(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }} error={!valid && rate !== ""}
              helperText="For reference only. The dashboard shows the rate you actually earned." />
          )}
          {canLink && (
            <TextField select label="Trading 212 sync" value={link} onChange={(e) => setLink(e.target.value as T212Link | "")}
              helperText="Which API key pair to sync this account with">
              <MenuItem value="">Not synced</MenuItem>
              <MenuItem value="invest">Invest account (T212_INVEST_*)</MenuItem>
              <MenuItem value="isa">Stocks ISA (T212_ISA_*)</MenuItem>
            </TextField>
          )}
          {account && (
            <FormControlLabel control={<Switch checked={archived} onChange={(e) => setArchived(e.target.checked)} />} label="Archived (closed account)" />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {account && (
          <Button color="error" sx={{ mr: "auto" }}
            onClick={() =>
              window.confirm(`Delete ${account.name} and ALL its transactions and balances? Archive it instead to keep its history.`) &&
              remove.mutate(undefined, { onSuccess: () => { onClose(); navigate("/accounts"); } })
            }>
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate(
              {
                name: name.trim(),
                provider,
                type,
                interest_rate: type === "cash" || type === "cash_isa" ? rateNum : null,
                t212_link: canLink && link ? link : null,
                opened_on: account?.opened_on ?? null,
                archived,
                sort_order: account?.sort_order ?? 99,
              },
              { onSuccess: onClose },
            )
          }>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
