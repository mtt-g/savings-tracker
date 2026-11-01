import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import PaymentsIcon from "@mui/icons-material/Payments";
import PercentIcon from "@mui/icons-material/Percent";
import SavingsIcon from "@mui/icons-material/Savings";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  LinearProgress,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart, lineClasses } from "@mui/x-charts/LineChart";
import dayjs from "dayjs";
import { Link } from "react-router";
import type { Dashboard as DashboardData } from "../../shared/calc";
import { isInvestmentType } from "../../shared/types";
import { useAccounts, useDashboard } from "../api/client";
import { CostBasisPanel } from "../components/CostBasisPanel";
import { DateRangeFilter, useDateRange } from "../components/DateRangeFilter";
import { ErrorAlert } from "../components/ErrorAlert";
import { useResolvedMode } from "../components/Layout";
import { StatCard } from "../components/StatCard";
import { date, money, moneyCompact, moneyWhole, pct, signedMoney, signedPct } from "../format";
import { seriesColor } from "../theme";
import { pointLabel } from "../format";

export function Dashboard() {
  const [range, setRange] = useDateRange();
  const { data, error, isLoading, isFetching } = useDashboard(range.from, range.to);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 500 }}>Dashboard</Typography>
          {data && <Typography color="text.secondary">{date(data.from)} – {date(data.to)}</Typography>}
        </Box>
        <DateRangeFilter value={range} onChange={setRange} />
      </Stack>
      <Box sx={{ height: 4 }}>{isFetching && <LinearProgress />}</Box>
      <ErrorAlert error={error} />
      {isLoading && <Typography color="text.secondary">Loading…</Typography>}
      {data && <DashboardBody data={data} />}
    </Stack>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const { totals, investments, premiumBonds } = data;
  const taxableInterest = data.allowances.psa.used;

  if (data.accounts.length === 0 || (totals.endValue === 0 && totals.startValue === 0 && totals.netContributions === 0)) {
    return (
      <Alert severity="info">
        Nothing recorded in this period yet. Add a transaction with the + button, import a CSV from the{" "}
        <MuiLink component={Link} to="/transactions">Transactions</MuiLink> page, or connect Trading 212 in{" "}
        <MuiLink component={Link} to="/settings">Settings</MuiLink>.
      </Alert>
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<AccountBalanceWalletIcon fontSize="small" />} label="Total balance" value={money(totals.endValue)}
            sub={`${signedMoney(totals.endValue - totals.startValue)} in this period`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<SavingsIcon fontSize="small" />} label="Saved" value={money(totals.netContributions)}
            sub={`${money(totals.deposits + totals.transfersIn)} in, ${money(totals.withdrawals + totals.transfersOut)} out`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<PercentIcon fontSize="small" />} label="Interest earned" value={money(totals.interest + totals.bonuses)}
            sub={`${money(taxableInterest)} taxable in ${data.allowances.label}`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<EmojiEventsIcon fontSize="small" />} label="Premium Bond prizes" value={money(totals.prizes)}
            sub={`${totals.prizeCount} ${totals.prizeCount === 1 ? "prize" : "prizes"}${premiumBonds?.effectiveRate != null ? `, ${pct(premiumBonds.effectiveRate)} a year` : ""}`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<PaymentsIcon fontSize="small" />} label="Dividends" value={money(totals.dividends)}
            sub={totals.fees ? `${money(totals.fees)} fees paid` : "No fees paid"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard icon={<ShowChartIcon fontSize="small" />} label="Investment growth" value={investments ? signedMoney(investments.growth) : "–"}
            sub={investments ? `${signedPct(investments.returnPct)} return, ${signedMoney(investments.marketGain)} from prices` : "No investment accounts"} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <BalanceChart data={data} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <AllowancesCard data={data} />
        </Grid>
        <Grid size={{ xs: 12, lg: premiumBonds ? 8 : 12 }}>
          <MonthlyChart data={data} />
        </Grid>
        {premiumBonds && (
          <Grid size={{ xs: 12, lg: 4 }}>
            <PremiumBondsCard data={data} />
          </Grid>
        )}
      </Grid>

      <AccountsTable data={data} />
      <CostBasisPanel compact />
      {data.goals.length > 0 && <GoalsCard data={data} />}
    </>
  );
}

/** Each account keeps the same colour everywhere, based on its position in the full account list. */
function useAccountColor() {
  const { data: accounts = [] } = useAccounts();
  const mode = useResolvedMode();
  return (id: number) => seriesColor(Math.max(0, accounts.findIndex((a) => a.id === id)), mode);
}

function BalanceChart({ data }: { data: DashboardData }) {
  const color = useAccountColor();
  const labels = data.series.map((p) => p.date);
  const accounts = data.accounts.filter((a) => data.series.some((p) => p.values[a.account.id] !== 0));
  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="Balance over time" subheader="Month-end balance by account" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <LineChart
          height={320}
          xAxis={[{ data: labels, scaleType: "point", valueFormatter: pointLabel }]}
          yAxis={[{ valueFormatter: (v: number) => moneyCompact(v * 100), width: 60 }]}
          series={accounts.map((a) => ({
            id: String(a.account.id),
            label: a.account.name,
            data: data.series.map((p) => (p.values[a.account.id] ?? 0) / 100),
            color: color(a.account.id),
            area: true,
            stack: "total",
            curve: "linear",
            showMark: false,
            valueFormatter: (v: number | null) => (v == null ? "" : money(v * 100)),
          }))}
          grid={{ horizontal: true }}
          slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
          sx={{ [`& .${lineClasses.area}`]: { fillOpacity: 0.85 }, [`& .${lineClasses.line}`]: { strokeWidth: 2 } }}
        />
      </CardContent>
    </Card>
  );
}

function MonthlyChart({ data }: { data: DashboardData }) {
  const mode = useResolvedMode();
  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="Saved and earned each month" subheader="Net deposits, and interest, prizes and dividends" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <BarChart
          height={280}
          xAxis={[{ data: data.monthly.map((m) => m.month), scaleType: "band", valueFormatter: (m: string) => dayjs(`${m}-01`).format("MMM YY") }]}
          yAxis={[{ valueFormatter: (v: number) => moneyCompact(v * 100), width: 60 }]}
          series={[
            { id: "saved", label: "Saved", data: data.monthly.map((m) => m.contributions / 100), color: seriesColor(0, mode), valueFormatter: (v) => (v == null ? "" : money(v * 100)) },
            { id: "earned", label: "Earned", data: data.monthly.map((m) => m.income / 100), color: seriesColor(1, mode), valueFormatter: (v) => (v == null ? "" : money(v * 100)) },
          ]}
          borderRadius={4}
          grid={{ horizontal: true }}
          slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
        />
      </CardContent>
    </Card>
  );
}

function Meter({ label, used, limit, note, goal }: { label: string; used: number; limit: number; note?: string; goal?: boolean }) {
  const ratio = limit > 0 ? used / limit : used > 0 ? Infinity : 0;
  const over = ratio > 1;
  // Limits warn as they fill up; goals turn green when reached.
  const status = goal ? (ratio >= 1 ? "success" : "primary") : over ? "error" : ratio >= 0.9 ? "warning" : "primary";
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {moneyWhole(used)} / {moneyWhole(limit)}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={Math.min(100, ratio * 100)} color={status} sx={{ height: 8, borderRadius: 4 }} />
      <Typography variant="caption" color={over && !goal ? "error" : "text.secondary"}>
        {goal
          ? ratio >= 1 ? "Reached" : `${moneyWhole(limit - used)} to go`
          : over ? `Over by ${moneyWhole(used - limit)}` : `${moneyWhole(limit - used)} left`}
        {note ? ` · ${note}` : ""}
      </Typography>
    </Box>
  );
}

function AllowancesCard({ data }: { data: DashboardData }) {
  const a = data.allowances;
  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={`Allowances ${a.label}`} subheader="For the tax year at the end of the selected period" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <Stack spacing={2.5}>
          <Meter label="ISA allowance" used={a.isa.used} limit={a.isa.limit} note="deposits + transfers in" />
          {a.isa.cashIsaLimit !== null && <Meter label="Cash ISA limit" used={a.isa.cashIsaUsed} limit={a.isa.cashIsaLimit} note="under-65s" />}
          <Meter label="Personal Savings Allowance" used={a.psa.used} limit={a.psa.limit} note="taxable interest" />
          <Meter label="Dividend allowance" used={a.dividends.used} limit={a.dividends.limit} note="outside ISAs" />
        </Stack>
      </CardContent>
    </Card>
  );
}

function PremiumBondsCard({ data }: { data: DashboardData }) {
  const pb = data.premiumBonds!;
  const diff = pb.effectiveRate != null ? pb.effectiveRate - pb.advertisedRate : null;
  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="Premium Bonds" slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>
        <Stack spacing={2.5}>
          <Meter label="Holding" used={pb.holding} limit={pb.limit} note="£50,000 maximum" />
          <Grid container spacing={2}>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">Prizes</Typography>
              <Typography variant="h6">{pb.prizeCount} · {money(pb.prizes)}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">Average holding</Typography>
              <Typography variant="h6">{moneyWhole(pb.averageHolding)}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">Your rate</Typography>
              <Typography variant="h6">{pct(pb.effectiveRate)}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">Prize fund rate</Typography>
              <Typography variant="h6">{pct(pb.advertisedRate)}</Typography>
            </Grid>
          </Grid>
          {diff != null && (
            <Typography variant="body2" color="text.secondary">
              {Math.abs(diff) < 0.05 ? "Right on the prize fund rate." : diff > 0 ? `Lucky: ${diff.toFixed(2)} points above the prize fund rate.` : `Unlucky: ${Math.abs(diff).toFixed(2)} points below the prize fund rate.`}{" "}
              Most people earn less than the advertised rate because big prizes are rare.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function AccountsTable({ data }: { data: DashboardData }) {
  const color = useAccountColor();
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
  return (
    <Card>
      <CardHeader title="By account" slotProps={{ title: { variant: "h6" } }} />
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Account</TableCell>
              <TableCell align="right">Start</TableCell>
              <TableCell align="right">Saved</TableCell>
              <TableCell align="right">Earned</TableCell>
              <TableCell align="right">Growth</TableCell>
              <TableCell align="right">End</TableCell>
              <TableCell align="right">Return</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.accounts.map(({ account, stats }) => (
              <TableRow key={account.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color(account.id), flexShrink: 0 }} />
                    <MuiLink component={Link} to={`/accounts/${account.id}`} underline="hover" color="inherit">{account.name}</MuiLink>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={num}>{money(stats.startValue)}</TableCell>
                <TableCell align="right" sx={num}>{money(stats.netContributions)}</TableCell>
                <TableCell align="right" sx={num}>{money(stats.income)}</TableCell>
                <TableCell align="right" sx={num}>{signedMoney(stats.growth)}</TableCell>
                <TableCell align="right" sx={num}>{money(stats.endValue)}</TableCell>
                <TableCell align="right" sx={num} title={isInvestmentType(account.type) ? "Money-weighted return for the period" : "Annualised interest rate earned"}>
                  {isInvestmentType(account.type) ? signedPct(stats.returnPct) : `${pct(stats.effectiveRate)} AER`}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ "& td": { fontWeight: 500, borderBottom: 0 } }}>
              <TableCell>Total</TableCell>
              <TableCell align="right" sx={num}>{money(data.totals.startValue)}</TableCell>
              <TableCell align="right" sx={num}>{money(data.totals.netContributions)}</TableCell>
              <TableCell align="right" sx={num}>{money(data.totals.income)}</TableCell>
              <TableCell align="right" sx={num}>{signedMoney(data.totals.growth)}</TableCell>
              <TableCell align="right" sx={num}>{money(data.totals.endValue)}</TableCell>
              <TableCell align="right" sx={num}>{signedPct(data.totals.returnPct)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Card>
  );
}

function GoalsCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader title="Goals" slotProps={{ title: { variant: "h6" } }}
        action={<MuiLink component={Link} to="/settings" sx={{ mr: 1 }}>Manage</MuiLink>} />
      <CardContent sx={{ pt: 0 }}>
        <Grid container spacing={3}>
          {data.goals.map(({ goal, current }) => (
            <Grid key={goal.id} size={{ xs: 12, md: 6 }}>
              <Meter goal label={goal.name} used={Math.max(0, current)} limit={goal.target_pence}
                note={goal.kind === "yearly_savings" ? "saved this tax year" : goal.target_date ? `by ${date(goal.target_date)}` : undefined} />
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
}
