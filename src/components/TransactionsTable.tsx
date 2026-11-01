import { Box, Chip, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { balanceEffect } from "../../shared/calc";
import { TX_TYPE_LABELS, type Transaction } from "../../shared/types";
import { useAccounts } from "../api/client";
import { date, money } from "../format";
import { TransactionDialog } from "./TransactionDialog";

export function TransactionsTable({ transactions, showAccount = true }: { transactions: Transaction[]; showAccount?: boolean }) {
  const { data: accounts = [] } = useAccounts();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [editing, setEditing] = useState<Transaction | undefined>();
  useEffect(() => setPage(0), [transactions.length]);

  if (!transactions.length) return <Typography color="text.secondary" sx={{ p: 2 }}>No transactions.</Typography>;

  const name = (id: number) => accounts.find((a) => a.id === id)?.name ?? "";
  const rows = transactions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              {showAccount && <TableCell>Account</TableCell>}
              <TableCell>Type</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((t) => {
              const signed = balanceEffect(t);
              const paidOut = t.type === "prize";
              return (
                <TableRow key={t.id} hover onClick={() => setEditing(t)} sx={{ cursor: "pointer" }}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{date(t.date)}</TableCell>
                  {showAccount && <TableCell>{name(t.account_id)}</TableCell>}
                  <TableCell>
                    <Chip size="small" variant="outlined" label={TX_TYPE_LABELS[t.type]} />
                    {t.source !== "manual" && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{t.source === "t212" ? "synced" : t.source}</Typography>}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.secondary" }}>{t.notes}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {paidOut ? (
                      <>
                        {money(t.amount_pence)}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>paid out</Typography>
                      </>
                    ) : (
                      <>{signed < 0 ? "−" : "+"}{money(Math.abs(signed))}</>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <TablePagination component="div" count={transactions.length} page={page} onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} rowsPerPageOptions={[25, 50, 100]} />
      <TransactionDialog open={!!editing} transaction={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}
