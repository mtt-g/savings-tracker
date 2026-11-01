import { InputAdornment, TextField, type TextFieldProps } from "@mui/material";

type Props = Omit<TextFieldProps, "onChange" | "value"> & { value: string; onChange: (v: string) => void; allowNegative?: boolean };

export function MoneyField({ value, onChange, allowNegative, ...rest }: Props) {
  return (
    <TextField
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        input: { startAdornment: <InputAdornment position="start">£</InputAdornment> },
        htmlInput: { inputMode: allowNegative ? "text" : "decimal", autoComplete: "off" },
      }}
    />
  );
}
