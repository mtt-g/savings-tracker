import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, MenuItem, Stack, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import type { Goal } from "../../shared/types";
import { api, useAccounts, useApiMutation, type GoalInput } from "../api/client";
import { parsePounds, penceToInput } from "../format";
import { ErrorAlert } from "./ErrorAlert";
import { MoneyField } from "./MoneyField";

export function GoalDialog({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  const { data: accounts = [] } = useAccounts();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Goal["kind"]>("balance");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState<Dayjs | null>(null);
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setKind(goal?.kind ?? "balance");
    setTarget(goal ? penceToInput(goal.target_pence) : "");
    setDate(goal?.target_date ? dayjs(goal.target_date) : null);
    setIds(goal?.account_ids ?? []);
  }, [open, goal]);

  const pence = parsePounds(target);
  const save = useApiMutation((body: GoalInput) => (goal ? api.put(`/goals/${goal.id}`, body) : api.post("/goals", body)));
  const remove = useApiMutation(() => api.delete(`/goals/${goal!.id}`));
  const valid = name.trim() && pence && pence > 0 && (!date || date.isValid());

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => { save.reset(); remove.reset(); } } }}>
      <DialogTitle>{goal ? "Edit goal" : "Add goal"}</DialogTitle>
      <DialogContent>
        <ErrorAlert error={save.error ?? remove.error} />
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" autoFocus />
          <TextField select label="Goal type" value={kind} onChange={(e) => setKind(e.target.value as Goal["kind"])}>
            <MenuItem value="balance">Reach a balance</MenuItem>
            <MenuItem value="yearly_savings">Save an amount this tax year</MenuItem>
          </TextField>
          <MoneyField label="Target" value={target} onChange={setTarget} error={target !== "" && !pence} />
          <TextField select label="Accounts" value={ids}
            slotProps={{ select: { multiple: true, renderValue: (v) => ((v as number[]).length ? (v as number[]).map((id) => accounts.find((a) => a.id === id)?.name).join(", ") : "All accounts"), displayEmpty: true } }}
            onChange={(e) => setIds(e.target.value as unknown as number[])}>
            {accounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                <Checkbox checked={ids.includes(a.id)} size="small" />
                <ListItemText primary={a.name} />
              </MenuItem>
            ))}
          </TextField>
          {kind === "balance" && (
            <DatePicker label="Target date (optional)" value={date} onChange={setDate} format="DD/MM/YYYY" slotProps={{ textField: { size: "small", fullWidth: true }, field: { clearable: true } }} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {goal && <Button color="error" sx={{ mr: "auto" }} onClick={() => window.confirm("Delete this goal?") && remove.mutate(undefined, { onSuccess: onClose })}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || save.isPending}
          onClick={() => save.mutate({
            name: name.trim(), kind, target_pence: pence!, target_date: kind === "balance" && date ? date.format("YYYY-MM-DD") : null,
            account_ids: ids.length ? ids : null,
          }, { onSuccess: onClose })}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
