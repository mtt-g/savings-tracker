import { Alert } from "@mui/material";

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert severity="error" sx={{ mb: 2 }}>{error instanceof Error ? error.message : String(error)}</Alert>;
}
