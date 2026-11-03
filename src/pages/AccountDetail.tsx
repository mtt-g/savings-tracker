import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import { LineChart, lineClasses } from "@mui/x-charts/LineChart";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { ACCOUNT_TYPE_LABELS, isInvestmentType, PROVIDER_LABELS } from "../../shared/types";
import { api, useAccount, useAccounts, useApiMutation, useTransactions, type AccountDetail as Detail } from "../api/client";
import { AccountDialog } from "../components/AccountDialog";
import { CostBasisPanel } from "../components/CostBasisPanel";
import { CsvImportDialog } from "../components/CsvImportDialog";
import { ErrorAlert } from "../components/ErrorAlert";
import { useResolvedMode } from "../components/Layout";
import { StatCard } from "../components/StatCard";
import { SyncButton } from "../components/SyncButton";
import { TradesPanel } from "../components/TradesPanel";
import { TransactionDialog } from "../components/TransactionDialog";
import { TransactionsTable } from "../components/TransactionsTable";
import { ValuationDialog } from "../components/ValuationDialog";
import { date, money, moneyCompact, pct, signedMoney, signedPct } from "../format";
import { seriesColor } from "../theme";
import { pointLabel } from "../format";

export function AccountDetail() {
  const id = Number(useParams().id);
  const { data, error, isLoading } = useAccount(id);
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions({ account_id: id });
  const mode = useResolvedMode();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const setTab = (v: string) => setParams(v === "overview" ? {} : { tab: v }, { replace: true });
  const [dialog, setDialog] = useState<"edit" | "tx" | "valuation" | "import" | null>(null);

  if (isLoading) return <Typography color="text.secondary">Loading…</Typography>;
  if (error || !data) return <ErrorAlert error={error ?? "Account not found"} />;

  const { account } = data;
  const color = seriesColor(Math.max(0, accounts.findIndex((a) => a.id === id)), mode);
  const summary = accounts.find((a) => a.id === id);
  const hasHoldings = data.holdings.length > 0;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" sx={{ fontWeight: 500 }}>{account.name}</Typography>
            <Tooltip title="Edit account"><IconButton onClick={() => setDialog("edit")}><EditIcon /></IconButton></Tooltip>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip size="small" label={ACCOUNT_TYPE_LABELS[account.type]} />
            <Chip size="small" variant="outlined" label={PROVIDER_LABELS[account.provider]} />
            {account.interest_rate != null && <Chip size="small" variant="outlined" label={`${account.interest_rate}% AER`} />}
            {account.archived ? <Chip size="small" color="warning" label="Archived" /> : null}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {account.t212_link && summary?.t212Configured && <SyncButton accountId={id} />}
          <Button startIcon={<UploadFileIcon />} onClick={() => setDialog("import")}>Import CSV</Button>
          <Button variant="outlined" startIcon={<EventAvailableIcon />} onClick={() => setDialog("valuation")}>Record balance</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog("tx")}>Transaction</Button>
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab value="overview" label="Overview" />
        <Tab value="transactions" label={`Transactions (${transactions.length})`} />
        {hasHoldings && <Tab value="holdings" label="Holdings" />}
        {account.t212_link && <Tab value="trades" label="Trades" />}
        {isInvestmentType(account.type) && account.type !== "pension" && <Tab value="cost" label="Cost basis" />}
        <Tab value="balances" label="Balances" />
      </Tabs>

      {tab === "overview" && <Overview data={data} color={color} />}
      {tab === "transactions" && <Card><TransactionsTable transactions={transactions} showAccount={false} /></Card>}
      {tab === "holdings" && hasHoldings && <Holdings data={data} />}
      {tab === "trades" && account.t212_link && <TradesPanel accountId={id} />}
      {tab === "cost" && isInvestmentType(account.type) && account.type !== "pension" && <CostBasisPanel accountId={id} />}
      {tab === "balances" && <Balances data={data} />}

      <AccountDialog open={dialog === "edit"} onClose={() => setDialog(null)} account={account} />
      <TransactionDialog open={dialog === "tx"} onClose={() => setDialog(null)} defaultAccountId={id} />
      <ValuationDialog open={dialog === "valuation"} onClose={() => setDialog(null)} accountId={id} accountName={account.name} />
      <CsvImportDialog open={dialog === "import"} onClose={() => setDialog(null)} defaultAccountId={id} />
    </Stack>
  );
}

function Overview({ data, color }: { data: Detail; color: string }) {
  const s = data.allTime;
  const invest = isInvestmentType(data.account.type);
  return (
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Balance" value={money(data.balance)} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Total paid in" value={money(s?.netContributions ?? 0)} sub="All time, after withdrawals" /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label={data.account.type === "premium_bonds" ? "Prizes won" : invest ? "Dividends & interest" : "Interest earned"}
            value={money(s?.income ?? 0)} sub={data.account.type === "premium_bonds" ? `${s?.prizeCount ?? 0} prizes` : "All time"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {invest
            ? <StatCard label="Total growth" value={signedMoney(s?.growth ?? 0)} sub={`${signedPct(s?.returnPct)} return, ${signedMoney(s?.marketGain ?? 0)} from prices`} />
            : <StatCard label="Rate earned" value={pct(s?.effectiveRate)} sub="Annualised over the account's life" />}
        </Grid>
      </Grid>
      <Card>
        <CardHeader title="Balance history" slotProps={{ title: { variant: "h6" } }} />
        <CardContent sx={{ pt: 0 }}>
          {data.history.length > 1 ? (
            <LineChart
              height={300}
              xAxis={[{ data: data.history.map((h) => h.date), scaleType: "point", valueFormatter: pointLabel }]}
              yAxis={[{ valueFormatter: (v: number) => moneyCompact(v * 100), width: 60 }]}
              series={[{ data: data.history.map((h) => h.value / 100), color, area: true, curve: "linear", showMark: false, label: data.account.name, valueFormatter: (v) => (v == null ? "" : money(v * 100)) }]}
              grid={{ horizontal: true }}
              hideLegend
              sx={{ [`& .${lineClasses.area}`]: { fillOpacity: 0.2 }, [`& .${lineClasses.line}`]: { strokeWidth: 2 } }}
            />
          ) : (
            <Typography color="text.secondary">Not enough history yet.</Typography>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Holdings({ data }: { data: Detail }) {
  const total = data.holdings.reduce((s, h) => s + h.value_pence, 0);
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
  return (
    <Card>
      <CardHeader title="Holdings" subheader={data.holdingsDate ? `As of ${date(data.holdingsDate)}` : undefined} slotProps={{ title: { variant: "h6" } }} />
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Holding</TableCell>
              <TableCell align="right">Shares</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell align="right">Cost</TableCell>
              <TableCell align="right">Gain</TableCell>
              <TableCell>Share of account</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.holdings.map((h) => {
              const gain = h.cost_pence != null ? h.value_pence - h.cost_pence : null;
              const share = total ? (h.value_pence / total) * 100 : 0;
              return (
                <TableRow key={h.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{h.name ?? h.ticker}</Typography>
                    <Typography variant="caption" color="text.secondary">{h.ticker}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={num}>{h.quantity.toLocaleString("en-GB", { maximumFractionDigits: 4 })}</TableCell>
                  <TableCell align="right" sx={num}>{money(h.value_pence)}</TableCell>
                  <TableCell align="right" sx={num}>{h.cost_pence != null ? money(h.cost_pence) : "–"}</TableCell>
                  <TableCell align="right" sx={num}>
                    {gain != null ? `${signedMoney(gain)} (${signedPct(h.cost_pence ? (gain / h.cost_pence) * 100 : null)})` : "–"}
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: "action.hover" }}>
                        <Box sx={{ width: `${share}%`, height: "100%", borderRadius: 3, bgcolor: "primary.main" }} />
                      </Box>
                      <Typography variant="caption" sx={num}>{share.toFixed(1)}%</Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Card>
  );
}

function Balances({ data }: { data: Detail }) {
  const remove = useApiMutation((vid: number) => api.delete(`/valuations/${vid}`));
  return (
    <Card>
      <CardHeader title="Recorded balances" subheader="Point-in-time values. Synced daily for Trading 212 accounts." slotProps={{ title: { variant: "h6" } }} />
      <ErrorAlert error={remove.error} />
      {data.valuations.length === 0 ? (
        <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
          {isInvestmentType(data.account.type)
            ? "No balances recorded. Record one now and then so growth can be worked out."
            : "None needed. The balance is worked out from transactions, but recording one corrects any drift."}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Source</TableCell>
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.valuations.map((v) => (
              <TableRow key={v.id} hover>
                <TableCell>{date(v.date)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{money(v.value_pence)}</TableCell>
                <TableCell>{v.source === "t212" ? "Trading 212 sync" : "Manual"}</TableCell>
                <TableCell padding="checkbox">
                  <IconButton size="small" aria-label="Delete balance" onClick={() => window.confirm("Delete this balance?") && remove.mutate(v.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
