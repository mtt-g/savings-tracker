import { Box, Card, CardHeader, Chip, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useTrades } from "../api/client";
import { date, money, signedMoney } from "../format";
import { DateRangeFilter, useDateRange } from "./DateRangeFilter";
import { ErrorAlert } from "./ErrorAlert";
import { StatCard } from "./StatCard";

/** A price in the instrument's own currency. Trading 212 reports UK shares in pence (GBX), which Intl doesn't know. */
function price(value: number | null, currency: string | null) {
  if (value == null) return "–";
  if (currency === "GBX" || currency === "GBp") return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}p`;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  } catch {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 4 });
  }
}

export function TradesPanel({ accountId }: { accountId: number }) {
  const [range, setRange] = useDateRange("all_time");
  const { data: trades = [], error } = useTrades(accountId, range.from === "all" ? undefined : range.from, range.to);
  const [side, setSide] = useState<"" | "buy" | "sell">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const q = search.trim().toLowerCase();
  const shown = trades.filter((t) => (!side || t.side === side) && (!q || t.ticker.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q)));
  const sum = (items: typeof shown, pick: (t: (typeof shown)[number]) => number | null) => items.reduce((n, t) => n + (pick(t) ?? 0), 0);
  const bought = sum(shown.filter((t) => t.side === "buy"), (t) => t.value_pence);
  const sold = sum(shown.filter((t) => t.side === "sell"), (t) => t.value_pence);
  const fees = sum(shown, (t) => t.fees_pence);
  const realised = sum(shown, (t) => t.realised_pl_pence);
  const rows = shown.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
        <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(0); }} />
        <TextField select label="Side" value={side} onChange={(e) => { setSide(e.target.value as "" | "buy" | "sell"); setPage(0); }} sx={{ minWidth: 160 }} fullWidth={false}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">Buys and sells</MenuItem>
          <MenuItem value="buy">Buys</MenuItem>
          <MenuItem value="sell">Sells</MenuItem>
        </TextField>
        <TextField label="Search holding" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} sx={{ minWidth: 200 }} fullWidth={false} />
      </Stack>
      <ErrorAlert error={error} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Bought" value={money(bought)} sub={`${shown.filter((t) => t.side === "buy").length} trades`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Sold" value={money(sold)} sub={`${shown.filter((t) => t.side === "sell").length} trades`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Fees and taxes" value={money(fees)} sub="Stamp duty, FX and other charges" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Realised profit or loss" value={signedMoney(realised)} sub="On shares you've sold, after fees" /></Grid>
      </Grid>
      <Card>
        <CardHeader title="Trades" subheader={`${shown.length} ${shown.length === 1 ? "trade" : "trades"} synced from Trading 212`} slotProps={{ title: { variant: "h6" } }} />
        {shown.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
            {trades.length ? "No trades match these filters." : "No trades yet. They load when you sync this account, and a long history can take a few presses of Sync now."}
          </Typography>
        ) : (
          <>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Holding</TableCell>
                    <TableCell>Side</TableCell>
                    <TableCell align="right">Shares</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Fees</TableCell>
                    <TableCell align="right">Realised</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={num}>{date(t.date)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.name ?? t.ticker}</Typography>
                        <Typography variant="caption" color="text.secondary">{t.ticker}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={t.side === "buy" ? "Buy" : "Sell"} />
                        {t.kind !== "TRADE" && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{t.kind.toLowerCase().replace(/_/g, " ")}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={num}>{t.quantity.toLocaleString("en-GB", { maximumFractionDigits: 6 })}</TableCell>
                      <TableCell align="right" sx={num}>{price(t.price, t.currency)}</TableCell>
                      <TableCell align="right" sx={num}>{t.value_pence != null ? money(t.value_pence) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{t.fees_pence ? money(t.fees_pence) : "–"}</TableCell>
                      <TableCell align="right" sx={num}>{t.side === "sell" && t.realised_pl_pence != null ? signedMoney(t.realised_pl_pence) : "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <TablePagination component="div" count={shown.length} page={page} onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} rowsPerPageOptions={[25, 50, 100]} />
          </>
        )}
      </Card>
    </Stack>
  );
}
