import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Box, Button, Card, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { balanceEffect } from "../../shared/calc";
import { TX_TYPE_LABELS, TX_TYPES, type TxType } from "../../shared/types";
import { useAccounts, useTransactions } from "../api/client";
import { CsvImportDialog } from "../components/CsvImportDialog";
import { DateRangeFilter, useDateRange } from "../components/DateRangeFilter";
import { ErrorAlert } from "../components/ErrorAlert";
import { TransactionsTable } from "../components/TransactionsTable";
import { money } from "../format";

export function Transactions() {
  const { data: accounts = [] } = useAccounts();
  const [range, setRange] = useDateRange();
  const [accountId, setAccountId] = useState<number | "">("");
  const [type, setType] = useState<TxType | "">("");
  const [importing, setImporting] = useState(false);
  const { data: transactions = [], error } = useTransactions({
    account_id: accountId || undefined,
    type: type || undefined,
    from: range.from === "all" ? undefined : range.from,
    to: range.to,
  });
  const net = transactions.reduce((s, t) => s + balanceEffect(t), 0);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 500 }}>Transactions</Typography>
          <Typography color="text.secondary">{transactions.length} transactions, {money(net)} net change in balances</Typography>
        </Box>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImporting(true)}>Import CSV</Button>
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
        <DateRangeFilter value={range} onChange={setRange} />
        <TextField select label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))} sx={{ minWidth: 200 }} fullWidth={false}>
          <MenuItem value="">All accounts</MenuItem>
          {accounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
        <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value as TxType | "")} sx={{ minWidth: 160 }} fullWidth={false}>
          <MenuItem value="">All types</MenuItem>
          {TX_TYPES.map((t) => <MenuItem key={t} value={t}>{TX_TYPE_LABELS[t]}</MenuItem>)}
        </TextField>
      </Stack>
      <ErrorAlert error={error} />
      <Card><TransactionsTable transactions={transactions} /></Card>
      {transactions.length === 2000 && <Typography variant="caption" color="text.secondary">Showing the latest 2,000. Narrow the filters to see older ones.</Typography>}
      <CsvImportDialog open={importing} onClose={() => setImporting(false)} defaultAccountId={accountId || undefined} />
    </Stack>
  );
}
