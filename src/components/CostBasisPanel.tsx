import AddIcon from "@mui/icons-material/Add";
import { Alert, Box, Button, Card, CardContent, CardHeader, Grid, Link as MuiLink, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { useState } from "react";
import { Link } from "react-router";
import { totalLots, type LotComparison } from "../../shared/lots";
import type { ShareLot } from "../../shared/types";
import { useShareLots } from "../api/client";
import { date, money, moneyCompact, signedMoney, unitMoney } from "../format";
import { seriesColor } from "../theme";
import { LotDialog } from "./LotDialog";
import { StatCard } from "./StatCard";
import { useResolvedMode } from "./Layout";

interface Props {
  /** Show one account's lots. Without it, every account's lots are combined (dashboard). */
  accountId?: number;
  compact?: boolean;
}

/**
 * Compares three figures for shares you acquired at a discount: what you paid, what they were worth the day you got
 * them (the tax base cost), and what they're worth now.
 */
export function CostBasisPanel({ accountId, compact }: Props) {
  const { data: all = [] } = useShareLots();
  const mode = useResolvedMode();
  const [editing, setEditing] = useState<ShareLot | undefined>();
  const [open, setOpen] = useState(false);
  const items = accountId ? all.filter((c) => c.lot.account_id === accountId) : all;

  const add = () => { setEditing(undefined); setOpen(true); };
  const dialog = accountId ? <LotDialog open={open} onClose={() => setOpen(false)} accountId={accountId} lot={editing} /> : null;

  if (!items.length) {
    if (compact || !accountId) return null;
    return (
      <Card>
        <CardHeader title="Cost basis" slotProps={{ title: { variant: "h6" } }} />
        <CardContent sx={{ pt: 0 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Record each batch of shares with what you paid and what they were worth the day you got them, for example shares
            bought through a Sharesave (SAYE) scheme at a discount. You'll see how the three figures compare.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={add}>Add shares</Button>
        </CardContent>
        {dialog}
      </Card>
    );
  }

  const t = totalLots(items);
  const sub = (label: string, value: number, show = true) => show && (
    <Box component="span" sx={{ display: "block" }}>{label}: <b>{signedMoney(value)}</b></Box>
  );
  const color = (i: number) => seriesColor(i, mode);
  const names = items.map((c) => c.lot.name);
  const series = (id: string, label: string, i: number, pick: (c: LotComparison) => number | null) => ({
    id, label, color: color(i), data: items.map((c) => { const v = pick(c); return v == null ? null : v / 100; }),
    valueFormatter: (v: number | null) => (v == null ? "n/a" : money(v * 100)),
  });

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard label="What you paid" value={money(t.paid)}
            sub={`${t.shares.toLocaleString("en-GB", { maximumFractionDigits: 2 })} shares, ${money(Math.round(t.shares ? t.paid / t.shares : 0))} each on average`} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard label="Worth when you got them" value={money(t.marketCost)}
            sub={<>{sub("Discount you received", t.discount, t.marketCost > 0)}<Box component="span" sx={{ display: "block" }}>The tax base cost, if this is the price on the day</Box></>} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatCard label="Worth now" value={money(t.currentValue)}
            sub={<>{sub("Against what you paid", t.gainVsPaid, t.currentValue > 0)}{sub("Against worth when acquired", t.gainVsMarket, t.currentValue > 0 && t.marketCost > 0)}</>} />
        </Grid>
      </Grid>

      {t.lotsWithoutValue > 0 && (
        <Alert severity="warning">
          {t.lotsWithoutValue} {t.lotsWithoutValue === 1 ? "batch has" : "batches have"} no current value yet. For a Trading 212 account, match it to a
          holding. Otherwise record the account's balance on the account page, and it's shared between batches by number of shares.
        </Alert>
      )}
      {t.lotsWithoutMarketPrice > 0 && (
        <Alert severity="info">
          {t.lotsWithoutMarketPrice} {t.lotsWithoutMarketPrice === 1 ? "batch has" : "batches have"} no market price, so {t.lotsWithoutMarketPrice === 1 ? "it's" : "they're"} left out of
          the "worth when you got them" comparisons.
        </Alert>
      )}

      <Card>
        <CardHeader title="Cost basis" subheader="What you paid, what they were worth when acquired, and what they're worth now"
          slotProps={{ title: { variant: "h6" } }}
          action={!compact && accountId ? <Button startIcon={<AddIcon />} onClick={add}>Add shares</Button> : compact ? <MuiLink component={Link} to="/accounts" sx={{ mr: 1 }}>Accounts</MuiLink> : undefined} />
        <CardContent sx={{ pt: 0 }}>
          <BarChart
            height={300}
            xAxis={[{ data: names, scaleType: "band" }]}
            yAxis={[{ valueFormatter: (v: number) => moneyCompact(v * 100), width: 60 }]}
            series={[
              series("paid", "You paid", 0, (c) => c.paid),
              series("market", "Worth when acquired", 1, (c) => c.marketCost),
              series("now", "Worth now", 2, (c) => c.currentValue),
            ]}
            borderRadius={4}
            grid={{ horizontal: true }}
            slotProps={{ legend: { position: { vertical: "bottom", horizontal: "center" } } }}
          />
        </CardContent>
        {!compact && (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Shares</TableCell>
                  <TableCell align="right">Number</TableCell>
                  <TableCell align="right">Paid each</TableCell>
                  <TableCell align="right">Worth each then</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Worth then</TableCell>
                  <TableCell align="right">Worth now</TableCell>
                  <TableCell align="right">Vs paid</TableCell>
                  <TableCell align="right">Vs worth then</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((c) => {
                  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
                  return (
                    <TableRow key={c.lot.id} hover sx={{ cursor: "pointer" }} onClick={() => { setEditing(c.lot); setOpen(true); }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.lot.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {date(c.lot.acquired_on)}{c.valueSource === "account" ? " · priced from account balance" : ""}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={num}>{c.lot.quantity.toLocaleString("en-GB", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell align="right" sx={num}>{unitMoney(c.lot.paid_per_share_pence)}</TableCell>
                      <TableCell align="right" sx={num}>{c.lot.market_per_share_pence != null ? unitMoney(c.lot.market_per_share_pence) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{money(c.paid)}</TableCell>
                      <TableCell align="right" sx={num}>{c.marketCost != null ? money(c.marketCost) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{c.currentValue != null ? money(c.currentValue) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{c.gainVsPaid != null ? signedMoney(c.gainVsPaid) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{c.gainVsMarket != null ? signedMoney(c.gainVsMarket) : "–"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>
      {dialog}
    </Stack>
  );
}
