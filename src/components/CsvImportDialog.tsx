import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { TX_TYPE_LABELS, TX_TYPES, type TxType } from "../../shared/types";
import { api, useAccounts, useApiMutation } from "../api/client";
import { detectPreset, guessType, parseAmount, parseCsv, parseDate, t212ActionType, type Mapping, type Preset } from "../csv";
import { money } from "../format";
import { ErrorAlert } from "./ErrorAlert";

interface PreviewRow {
  include: boolean;
  date: string;
  type: TxType;
  amount_pence: number;
  notes: string | null;
  external_ref: string;
}

const PRESET_LABELS: Record<Preset, string> = { t212: "Trading 212 export", monzo: "Monzo export", generic: "Generic CSV" };

export function CsvImportDialog({ open, onClose, defaultAccountId }: { open: boolean; onClose: () => void; defaultAccountId?: number }) {
  const { data: accounts = [] } = useAccounts();
  const [accountId, setAccountId] = useState<number | "">(defaultAccountId ?? "");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [preset, setPreset] = useState<Preset>("generic");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [invert, setInvert] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, Partial<PreviewRow>>>({});
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const reset = () => {
    setFileName(""); setTable(null); setMapping(null); setOverrides({}); setResult(null); setInvert(false);
    setAccountId(defaultAccountId ?? "");
  };

  const onFile = async (file: File) => {
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setTable(parsed);
    setOverrides({});
    setResult(null);
    if (parsed.length) {
      const d = detectPreset(parsed[0]);
      setPreset(d.preset);
      setMapping(d.mapping);
    }
  };

  const headers = table?.[0] ?? [];
  const rows = useMemo<PreviewRow[]>(() => {
    if (!table || !mapping) return [];
    const seen = new Map<string, number>();
    const out: PreviewRow[] = [];
    for (const r of table.slice(1)) {
      const date = parseDate(r[mapping.date] ?? "");
      let amt = parseAmount(r[mapping.amount] ?? "");
      if (!date || amt === null || amt === 0) continue;
      if (invert) amt = -amt;
      const desc = mapping.description >= 0 ? (r[mapping.description] ?? "").trim() : "";
      let type: TxType | null;
      if (preset === "t212" && mapping.action >= 0) {
        const action = r[mapping.action] ?? "";
        type = t212ActionType(action, amt);
        if (!type) continue;
        // T212 shows withdrawals and fees as negative totals; dividends carry the ticker.
        const ticker = r[headers.findIndex((h) => h === "Ticker")] ?? "";
        out.push(build(date, type, Math.abs(amt), type === "dividend" ? ticker || desc : desc || null, r));
        continue;
      }
      type = guessType(desc, amt);
      out.push(build(date, type, Math.abs(amt), desc || null, r));
    }
    return out;

    function build(date: string, type: TxType, amount_pence: number, notes: string | null, r: string[]): PreviewRow {
      let ref = mapping!.reference >= 0 ? (r[mapping!.reference] ?? "").trim() : "";
      if (!ref) {
        // No ID column: derive a stable key so re-importing the same file doesn't duplicate rows.
        const base = `${date}|${amount_pence}|${notes ?? ""}`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        ref = `${base}|${n}`;
      }
      return { include: true, date, type, amount_pence, notes, external_ref: ref };
    }
  }, [table, mapping, preset, invert, headers]);

  const finalRows = rows.map((r, i) => ({ ...r, ...overrides[i] }));
  const included = finalRows.filter((r) => r.include);
  const account = accounts.find((a) => a.id === accountId);

  const importRows = useApiMutation(() =>
    api.post<{ inserted: number; skipped: number }>("/transactions/bulk", {
      account_id: accountId,
      rows: included.map(({ include: _include, ...r }) => r),
    }),
  );

  const colSelect = (label: string, key: keyof Mapping, optional = false) => (
    <TextField select label={label} value={mapping?.[key] ?? -1} sx={{ minWidth: 150 }} fullWidth={false}
      onChange={(e) => { setMapping({ ...mapping!, [key]: Number(e.target.value) }); setOverrides({}); }}>
      {optional && <MenuItem value={-1}>None</MenuItem>}
      {headers.map((h, i) => <MenuItem key={i} value={i}>{h || `Column ${i + 1}`}</MenuItem>)}
    </TextField>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" slotProps={{ transition: { onExited: () => { reset(); importRows.reset(); } } }}>
      <DialogTitle>Import transactions from CSV</DialogTitle>
      <DialogContent>
        <ErrorAlert error={importRows.error} />
        {result ? (
          <Alert severity="success">Imported {result.inserted} transactions{result.skipped ? `, skipped ${result.skipped} already imported` : ""}.</Alert>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select label="Import into account" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} sx={{ minWidth: 240 }} fullWidth={false}>
                {accounts.filter((a) => !a.archived).map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </TextField>
              <Button variant="outlined" component="label">
                {fileName || "Choose CSV file"}
                <input hidden type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </Button>
            </Stack>
            {account?.t212_link && (
              <Alert severity="warning">
                This account syncs from Trading 212, which already loads its full history. Importing a CSV as well will
                probably create duplicates.
              </Alert>
            )}
            {table && mapping && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Detected format: <b>{PRESET_LABELS[preset]}</b>.
                  {preset === "t212" && " Buys, sells and currency conversions are skipped because they don't change the account's value."}
                </Typography>
                <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  {colSelect("Date column", "date")}
                  {colSelect("Amount column", "amount")}
                  {colSelect("Description", "description", true)}
                  {colSelect("Unique ID", "reference", true)}
                  {preset !== "t212" && (
                    <FormControlLabel control={<Switch checked={invert} onChange={(e) => { setInvert(e.target.checked); setOverrides({}); }} />}
                      label="Flip signs (e.g. pot transfers from a current account export)" />
                  )}
                </Stack>
                <Typography variant="body2">
                  {included.length} of {rows.length} rows will be imported, totalling{" "}
                  {money(included.reduce((s, r) => s + (["withdrawal", "fee", "transfer_out"].includes(r.type) ? -r.amount_pence : r.amount_pence), 0))} net.
                  Untick anything that isn't money moving in or out of this account.
                </Typography>
                <Box sx={{ maxHeight: 360, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>Date</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Description</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {finalRows.map((r, i) => (
                        <TableRow key={i} sx={{ opacity: r.include ? 1 : 0.45 }}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" checked={r.include} onChange={(e) => setOverrides({ ...overrides, [i]: { ...overrides[i], include: e.target.checked } })} />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{r.date}</TableCell>
                          <TableCell>
                            <TextField select variant="standard" value={r.type} fullWidth={false}
                              onChange={(e) => setOverrides({ ...overrides, [i]: { ...overrides[i], type: e.target.value as TxType } })}>
                              {TX_TYPES.map((t) => <MenuItem key={t} value={t}>{TX_TYPE_LABELS[t]}</MenuItem>)}
                            </TextField>
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{money(r.amount_pence)}</TableCell>
                          <TableCell sx={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{result ? "Done" : "Cancel"}</Button>
        {!result && (
          <Button variant="contained" disabled={accountId === "" || !included.length || importRows.isPending}
            onClick={() => importRows.mutate(undefined, { onSuccess: setResult })}>
            Import {included.length || ""}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
