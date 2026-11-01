import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Box, Button, Card, CardActionArea, CardActions, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router";
import { taxYearLabel, taxYearOf } from "../../shared/tax";
import { ACCOUNT_TYPE_LABELS, isInvestmentType } from "../../shared/types";
import { useAccounts, type AccountSummary } from "../api/client";
import { AccountDialog } from "../components/AccountDialog";
import { CsvImportDialog } from "../components/CsvImportDialog";
import { ErrorAlert } from "../components/ErrorAlert";
import { useResolvedMode } from "../components/Layout";
import { SyncButton } from "../components/SyncButton";
import { money, signedMoney } from "../format";
import { seriesColor } from "../theme";
import { todayLondon } from "../../shared/dates";

export function Accounts() {
  const { data: accounts = [], error, isLoading } = useAccounts();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = active.reduce((s, a) => s + a.balance, 0);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 500 }}>Accounts</Typography>
          <Typography color="text.secondary">{money(total)} across {active.length} accounts</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<UploadFileIcon />} onClick={() => setImporting(true)}>Import CSV</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Add account</Button>
        </Stack>
      </Stack>
      <ErrorAlert error={error} />
      {isLoading && <Typography color="text.secondary">Loading…</Typography>}
      <Grid container spacing={2}>
        {active.map((a) => (
          <Grid key={a.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <AccountCard account={a} index={accounts.indexOf(a)} />
          </Grid>
        ))}
      </Grid>
      {archived.length > 0 && (
        <>
          <Typography variant="h6">Archived</Typography>
          <Grid container spacing={2}>
            {archived.map((a) => (
              <Grid key={a.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <AccountCard account={a} index={accounts.indexOf(a)} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
      <AccountDialog open={adding} onClose={() => setAdding(false)} />
      <CsvImportDialog open={importing} onClose={() => setImporting(false)} />
    </Stack>
  );
}

function AccountCard({ account: a, index }: { account: AccountSummary; index: number }) {
  const mode = useResolvedMode();
  const ty = taxYearLabel(taxYearOf(todayLondon()));
  const earned = a.taxYear.income;
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column", opacity: a.archived ? 0.7 : 1 }}>
      <CardActionArea component={Link} to={`/accounts/${a.id}`} sx={{ flexGrow: 1, alignItems: "stretch" }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: seriesColor(index, mode) }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 500, flexGrow: 1 }}>{a.name}</Typography>
            <Chip size="small" label={ACCOUNT_TYPE_LABELS[a.type]} />
          </Stack>
          <Typography variant="h5" sx={{ fontVariantNumeric: "tabular-nums" }}>{money(a.balance)}</Typography>
          <Typography variant="body2" color="text.secondary">
            {ty}: {money(a.taxYear.netContributions)} saved, {money(earned)} earned
            {isInvestmentType(a.type) ? `, ${signedMoney(a.taxYear.marketGain)} from prices` : ""}
          </Typography>
          {a.t212_link && (
            <Typography variant="caption" color={a.lastSync?.status === "error" ? "error" : "text.secondary"} sx={{ display: "block", mt: 1 }}>
              {!a.t212Configured
                ? "Trading 212 API key not set"
                : a.lastSync
                  ? `Last sync ${new Date(`${a.lastSync.started_at}Z`).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${a.lastSync.status === "error" ? `: ${a.lastSync.message}` : ""}`
                  : "Not synced yet"}
            </Typography>
          )}
          {isInvestmentType(a.type) && !a.t212_link && !a.lastValuation && (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
              Record a balance so growth can be worked out
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
      {a.t212_link && a.t212Configured && (
        <CardActions>
          <SyncButton accountId={a.id} size="small" />
        </CardActions>
      )}
    </Card>
  );
}
