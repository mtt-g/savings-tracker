import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: { palette: { primary: { main: "#2a78d6" }, background: { default: "#f6f6f4", paper: "#fcfcfb" } } },
    dark: { palette: { primary: { main: "#3987e5" }, background: { default: "#111110", paper: "#1a1a19" } } },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: "Roboto, system-ui, sans-serif" },
  components: {
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
    MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 500 } } },
  },
});

/**
 * Categorical series colours, validated for colour-blind separation (see the dataviz palette).
 * Each account keeps its colour everywhere based on its position in the full account list,
 * so filtering never repaints accounts.
 */
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

export const seriesColor = (index: number, mode: "light" | "dark") => SERIES[mode][index % SERIES[mode].length];
