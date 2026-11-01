import { MenuItem, Stack, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { useSearchParams } from "react-router";
import { addDays, todayLondon } from "../../shared/dates";
import { taxYearLabel, taxYearOf, taxYearRange } from "../../shared/tax";

export type RangePreset = "this_tax_year" | "last_tax_year" | "calendar_ytd" | "last_12_months" | "all_time" | "custom";

export interface DateRange {
  preset: RangePreset;
  from: string; // "all" for all time
  to: string;
}

function presetRange(preset: Exclude<RangePreset, "custom">): { from: string; to: string } {
  const today = todayLondon();
  const ty = taxYearOf(today);
  switch (preset) {
    case "this_tax_year": return { from: taxYearRange(ty).from, to: today };
    case "last_tax_year": return taxYearRange(ty - 1);
    case "calendar_ytd": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last_12_months": return { from: addDays(today, -364), to: today };
    case "all_time": return { from: "all", to: today };
  }
}

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Reads the selected range from the URL so it survives reloads and can be bookmarked. Defaults to this tax year. */
export function useDateRange(defaultPreset: Exclude<RangePreset, "custom"> = "this_tax_year"): [DateRange, (r: DateRange) => void] {
  const [params, setParams] = useSearchParams();
  const preset = (params.get("range") as RangePreset | null) ?? defaultPreset;
  let range: DateRange;
  if (preset === "custom" && isDate(params.get("from")) && isDate(params.get("to"))) {
    range = { preset, from: params.get("from")!, to: params.get("to")! };
  } else {
    const p = preset === "custom" ? defaultPreset : preset;
    range = { preset: p, ...presetRange(p) };
  }
  const set = (r: DateRange) => {
    const next = new URLSearchParams(params);
    next.set("range", r.preset);
    if (r.preset === "custom") { next.set("from", r.from); next.set("to", r.to); }
    else { next.delete("from"); next.delete("to"); }
    if (r.preset === defaultPreset) next.delete("range");
    setParams(next, { replace: true });
  };
  return [range, set];
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const ty = taxYearOf(todayLondon());
  const labels: Record<RangePreset, string> = {
    this_tax_year: `This tax year (${taxYearLabel(ty)})`,
    last_tax_year: `Last tax year (${taxYearLabel(ty - 1)})`,
    calendar_ytd: "Calendar year to date",
    last_12_months: "Last 12 months",
    all_time: "All time",
    custom: "Custom range",
  };
  const pickerProps = { format: "DD/MM/YYYY", disableFuture: true, slotProps: { textField: { size: "small" as const, sx: { width: 160 } } } };

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
      <TextField select size="small" value={value.preset} sx={{ minWidth: 240 }} fullWidth={false} label="Period"
        onChange={(e) => {
          const p = e.target.value as RangePreset;
          if (p === "custom") onChange({ preset: p, from: value.from === "all" ? taxYearRange(ty).from : value.from, to: value.to });
          else onChange({ preset: p, ...presetRange(p) });
        }}>
        {(Object.keys(labels) as RangePreset[]).map((p) => <MenuItem key={p} value={p}>{labels[p]}</MenuItem>)}
      </TextField>
      {value.preset === "custom" && (
        <Stack direction="row" spacing={1.5}>
          <DatePicker label="From" value={dayjs(value.from)} maxDate={dayjs(value.to)} {...pickerProps}
            onChange={(d) => d?.isValid() && onChange({ ...value, from: d.format("YYYY-MM-DD") })} />
          <DatePicker label="To" value={dayjs(value.to)} minDate={dayjs(value.from)} {...pickerProps}
            onChange={(d) => d?.isValid() && onChange({ ...value, to: d.format("YYYY-MM-DD") })} />
        </Stack>
      )}
    </Stack>
  );
}
