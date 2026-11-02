import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import type { ShareLot } from "../../shared/types";
import { api, useAllHoldings, useApiMutation, type ShareLotInput } from "../api/client";
import { money, parseUnitPounds, unitToInput } from "../format";
import { ErrorAlert } from "./ErrorAlert";
import { MoneyField } from "./MoneyField";

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: number;
  lot?: ShareLot;
}

export function LotDialog({ open, onClose, accountId, lot }: Props) {
  const { data: allHoldings = [] } = useAllHoldings();
  // The same stock can be held in two Trading 212 accounts; list each ticker once.
  const holdings = [...new Map(allHoldings.map((h) => [h.ticker, h])).values()];
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState<Dayjs | null>(null);
  const [quantity, setQuantity] = useState("");
  const [paid, setPaid] = useState("");
  const [market, setMarket] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(lot?.name ?? "");
    setTicker(lot?.ticker ?? "");
    setDate(lot ? dayjs(lot.acquired_on) : null);
    setQuantity(lot ? String(lot.quantity) : "");
    setPaid(lot ? unitToInput(lot.paid_per_share_pence) : "");
    setMarket(lot?.market_per_share_pence != null ? unitToInput(lot.market_per_share_pence) : "");
    setNotes(lot?.notes ?? "");
  }, [open, lot]);

  const qty = Number(quantity);
  const paidPence = parseUnitPounds(paid);
  const marketPence = market.trim() === "" ? null : parseUnitPounds(market);
  const validQty = quantity.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const valid = name.trim() !== "" && !!date?.isValid() && validQty && paidPence !== null && (market.trim() === "" || marketPence !== null);

  const save = useApiMutation((body: ShareLotInput & { account_id: number }) => (lot ? api.put(`/share-lots/${lot.id}`, body) : api.post("/share-lots", body)));
  const remove = useApiMutation(() => api.delete(`/share-lots/${lot!.id}`));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => { save.reset(); remove.reset(); } } }}>
      <DialogTitle>{lot ? "Edit shares" : "Add shares"}</DialogTitle>
      <DialogContent>
        <ErrorAlert error={save.error ?? remove.error} />
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Flutter, 2021 Sharesave" autoFocus />
          <DatePicker label="Date acquired" value={date} onChange={setDate} disableFuture format="DD/MM/YYYY" slotProps={{ textField: { size: "small", fullWidth: true } }} />
          <TextField label="Number of shares" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={quantity !== "" && !validQty}
            slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <MoneyField label="Price you paid per share" value={paid} onChange={setPaid} error={paid !== "" && paidPence === null}
            helperText="Your Sharesave strike price. Use 0 for free shares" />
          <MoneyField label="Market price per share when acquired" value={market} onChange={setMarket} error={market !== "" && marketPence === null}
            helperText="Optional. The share price on the day you got them, usually your tax base cost" />
          {holdings.length > 0 && (
            <TextField select label="Matching Trading 212 holding" value={ticker} onChange={(e) => setTicker(e.target.value)}
              helperText="Prices these shares from the Trading 212 sync, even if the holding is in a different account">
              <MenuItem value="">None</MenuItem>
              {holdings.map((h) => <MenuItem key={h.ticker} value={h.ticker}>{h.name ?? h.ticker} ({h.ticker})</MenuItem>)}
            </TextField>
          )}
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline maxRows={3} />
          {validQty && paidPence !== null && (
            <Typography variant="body2" color="text.secondary">
              You paid {money(Math.round(qty * paidPence))} in total
              {marketPence !== null && market.trim() !== "" ? `, and they were worth ${money(Math.round(qty * marketPence))} when you got them` : ""}.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {lot && (
          <Button color="error" sx={{ mr: "auto" }} disabled={remove.isPending}
            onClick={() => window.confirm("Delete these shares?") && remove.mutate(undefined, { onSuccess: onClose })}>
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate(
              {
                account_id: accountId,
                name: name.trim(),
                ticker: ticker || null,
                acquired_on: date!.format("YYYY-MM-DD"),
                quantity: qty,
                paid_per_share_pence: paidPence!,
                market_per_share_pence: market.trim() === "" ? null : marketPence,
                notes: notes.trim() || null,
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
