import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api, useApiMutation } from "../api/client";
import { parsePounds } from "../format";
import { ErrorAlert } from "./ErrorAlert";
import { MoneyField } from "./MoneyField";

export function ValuationDialog({ open, onClose, accountId, accountName }: { open: boolean; onClose: () => void; accountId: number; accountName: string }) {
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) { setDate(dayjs()); setValue(""); }
  }, [open]);
  const pence = parsePounds(value);
  const save = useApiMutation((body: { account_id: number; date: string; value_pence: number }) => api.put("/valuations", body));
  const valid = date?.isValid() && pence !== null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => save.reset() } }}>
      <DialogTitle>Record balance</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          The total value of {accountName} at the end of the chosen day. For investment accounts this is what separates
          growth from deposits. For cash accounts it corrects any drift from missed transactions.
        </DialogContentText>
        <ErrorAlert error={save.error} />
        <Stack spacing={2}>
          <DatePicker label="Date" value={date} onChange={setDate} disableFuture format="DD/MM/YYYY" slotProps={{ textField: { size: "small", fullWidth: true } }} />
          <MoneyField label="Balance" value={value} onChange={setValue} autoFocus error={value !== "" && pence === null} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || save.isPending}
          onClick={() => save.mutate({ account_id: accountId, date: date!.format("YYYY-MM-DD"), value_pence: pence! }, { onSuccess: onClose })}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
