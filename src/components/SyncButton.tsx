import SyncIcon from "@mui/icons-material/Sync";
import { Button, CircularProgress, Snackbar, Alert } from "@mui/material";
import { useState } from "react";
import { api, ApiError, useApiMutation } from "../api/client";

export function SyncButton({ accountId, size = "medium" }: { accountId: number; size?: "small" | "medium" }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sync = useApiMutation(() => api.post<{ ok: boolean; message: string }>(`/accounts/${accountId}/sync`));
  return (
    <>
      <Button size={size} variant="outlined" disabled={sync.isPending}
        startIcon={sync.isPending ? <CircularProgress size={16} /> : <SyncIcon />}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          sync.mutate(undefined, {
            onSuccess: (r) => setMsg({ ok: true, text: r.message }),
            onError: (err) => setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Sync failed" }),
          });
        }}>
        Sync now
      </Button>
      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={msg?.ok ? "success" : "error"} onClose={() => setMsg(null)} variant="filled">{msg?.text}</Alert>
      </Snackbar>
    </>
  );
}
