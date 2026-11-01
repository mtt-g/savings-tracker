import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Goal, Settings as SettingsData, TaxBand } from "../../shared/types";
import { api, useAccounts, useApiMutation, useGoals, useSettings, useSyncRuns } from "../api/client";
import { ErrorAlert } from "../components/ErrorAlert";
import { GoalDialog } from "../components/GoalDialog";
import { moneyWhole } from "../format";

export function Settings() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" sx={{ fontWeight: 500 }}>Settings</Typography>
      <TaxSettings />
      <Goals />
      <Trading212 />
      <Data />
    </Stack>
  );
}

function TaxSettings() {
  const { data } = useSettings();
  const [band, setBand] = useState<TaxBand>("higher");
  const [rate, setRate] = useState("");
  useEffect(() => {
    if (data) { setBand(data.tax_band); setRate(String(data.premium_bonds_prize_rate)); }
  }, [data]);
  const save = useApiMutation((s: SettingsData) => api.put("/settings", s));
  const rateNum = Number(rate);
  const dirty = data && (band !== data.tax_band || rateNum !== data.premium_bonds_prize_rate);

  return (
    <Card>
      <CardHeader title="Tax and rates" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <ErrorAlert error={save.error} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "flex-start" } }}>
          <TextField select label="Income tax band" value={band} onChange={(e) => setBand(e.target.value as TaxBand)}
            helperText={`Personal Savings Allowance: ${band === "basic" ? "£1,000" : band === "higher" ? "£500" : "£0"}`}>
            <MenuItem value="basic">Basic rate</MenuItem>
            <MenuItem value="higher">Higher rate</MenuItem>
            <MenuItem value="additional">Additional rate</MenuItem>
          </TextField>
          <TextField label="Premium Bonds prize fund rate (%)" value={rate} onChange={(e) => setRate(e.target.value)}
            error={!Number.isFinite(rateNum) || rateNum < 0} slotProps={{ htmlInput: { inputMode: "decimal" } }}
            helperText={<>Check the current rate at <MuiLink href="https://www.nsandi.com/products/premium-bonds" target="_blank" rel="noreferrer">nsandi.com</MuiLink></>} />
          <Button variant="contained" disabled={!dirty || save.isPending || !Number.isFinite(rateNum)} sx={{ flexShrink: 0 }}
            onClick={() => save.mutate({ tax_band: band, premium_bonds_prize_rate: rateNum })}>
            Save
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Goals() {
  const { data: goals = [] } = useGoals();
  const [editing, setEditing] = useState<Goal | undefined>();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Goals" subheader="Shown on the dashboard" slotProps={{ title: { variant: "h6" } }}
        action={<Button startIcon={<AddIcon />} onClick={() => { setEditing(undefined); setOpen(true); }}>Add goal</Button>} />
      {goals.length === 0 ? (
        <CardContent sx={{ pt: 0 }}><Typography color="text.secondary">No goals yet. Try an emergency fund target or a yearly savings target.</Typography></CardContent>
      ) : (
        <List dense>
          {goals.map((g) => (
            <ListItemButton key={g.id} onClick={() => { setEditing(g); setOpen(true); }}>
              <ListItemText primary={g.name} secondary={`${g.kind === "balance" ? "Reach" : "Save this tax year"} ${moneyWhole(g.target_pence)}`} />
            </ListItemButton>
          ))}
        </List>
      )}
      <GoalDialog open={open} goal={editing} onClose={() => setOpen(false)} />
    </Card>
  );
}

function Trading212() {
  const { data: accounts = [] } = useAccounts();
  const { data: runs = [] } = useSyncRuns();
  const linked = accounts.filter((a) => a.t212_link);
  return (
    <Card>
      <CardHeader title="Trading 212 sync" subheader="Runs every morning, or use Sync now on an account" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <Stack spacing={2}>
          {linked.length === 0 && <Alert severity="info">No accounts are linked. Edit a Trading 212 Invest or Stocks ISA account to link it.</Alert>}
          {linked.map((a) => (
            <Stack key={a.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ flexGrow: 1 }}>{a.name}</Typography>
              <Chip size="small" variant="outlined" label={a.t212_link === "invest" ? "T212_INVEST_*" : "T212_ISA_*"} />
              <Chip size="small" color={a.t212Configured ? "success" : "warning"} label={a.t212Configured ? "API key set" : "API key missing"} />
            </Stack>
          ))}
          <Typography variant="body2" color="text.secondary">
            Create a read-only API key in the Trading 212 app (Settings → API) for each account, with the <i>Account data</i>,{" "}
            <i>History</i> and <i>Portfolio</i> permissions. Then add it as Worker secrets, for example{" "}
            <code>npx wrangler secret put T212_ISA_KEY</code> and <code>T212_ISA_SECRET</code>. The Cash ISA isn't available
            through the API, so add its interest by hand or import a CSV.
          </Typography>
          {runs.length > 0 && (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>When</TableCell><TableCell>Account</TableCell><TableCell>Result</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {runs.slice(0, 10).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(`${r.started_at}Z`).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                      <TableCell>{accounts.find((a) => a.id === r.account_id)?.name}</TableCell>
                      <TableCell sx={{ color: r.status === "error" ? "error.main" : undefined }}>{r.message ?? r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Data() {
  return (
    <Card>
      <CardHeader title="Your data" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Download everything as JSON for a backup. Cloudflare D1 also keeps point-in-time restores (Time Travel) for the
          last 7 days on the free plan.
        </Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} href="/api/export">Export JSON</Button>
      </CardContent>
    </Card>
  );
}
