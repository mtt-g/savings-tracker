import { Box, Card, CardContent, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: ReactNode;
}

/** A single headline number. Text stays in ink colours; the icon gives each card its identity. */
export function StatCard({ label, value, sub, icon }: Props) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", mb: 1 }}>
          {icon}
          <Typography variant="body2">{label}</Typography>
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        {sub && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{sub}</Typography>}
      </CardContent>
    </Card>
  );
}
