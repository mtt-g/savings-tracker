import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AddIcon from "@mui/icons-material/Add";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DashboardIcon from "@mui/icons-material/Dashboard";
import LightModeIcon from "@mui/icons-material/LightMode";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Drawer,
  Fab,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useColorScheme, useTheme } from "@mui/material/styles";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { TransactionDialog } from "./TransactionDialog";

const NAV = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/accounts", label: "Accounts", icon: <AccountBalanceIcon /> },
  { to: "/transactions", label: "Transactions", icon: <ReceiptLongIcon /> },
  { to: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

const DRAWER_WIDTH = 220;

export function useResolvedMode(): "light" | "dark" {
  const { mode, systemMode } = useColorScheme();
  return (mode === "system" ? systemMode : mode) === "dark" ? "dark" : "light";
}

export function Layout() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const location = useLocation();
  const { setMode } = useColorScheme();
  const resolved = useResolvedMode();
  const [adding, setAdding] = useState(false);

  const current = NAV.slice()
    .reverse()
    .find((n) => (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)))?.to ?? "/";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Box component="img" src="/icon.svg" alt="" sx={{ width: 28, height: 28, mr: 1.5 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 500 }}>
            Savings Tracker
          </Typography>
          <Tooltip title={resolved === "dark" ? "Light mode" : "Dark mode"}>
            <IconButton onClick={() => setMode(resolved === "dark" ? "light" : "dark")} aria-label="Toggle dark mode">
              {resolved === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {desktop && (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}>
          <Toolbar />
          <List sx={{ px: 1 }}>
            {NAV.map((n) => (
              <ListItemButton key={n.to} component={Link} to={n.to} selected={current === n.to} sx={{ borderRadius: 6, mb: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 }, pb: { xs: 12, md: 10 } }}>
        <Toolbar />
        <Outlet />
      </Box>

      <Tooltip title="Add transaction">
        <Fab color="primary" aria-label="Add transaction" onClick={() => setAdding(true)} sx={{ position: "fixed", right: 24, bottom: desktop ? 24 : 80 }}>
          <AddIcon />
        </Fab>
      </Tooltip>
      <TransactionDialog open={adding} onClose={() => setAdding(false)} />

      {!desktop && (
        <Paper sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar }} elevation={3}>
          <BottomNavigation value={current} showLabels>
            {NAV.map((n) => (
              <BottomNavigationAction key={n.to} component={Link} to={n.to} value={n.to} label={n.label} icon={n.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
