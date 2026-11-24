import type { CSSProperties } from 'react';

interface FieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  style?: CSSProperties;
}

/** Single or multi line text field with the parchment look. */
export default function Field({ multiline = false, rows, onValueChange, ...rest }: FieldProps) {
  if (multiline) {
    return <textarea {...rest} rows={rows} className="kit-field" onChange={(event) => onValueChange(event.target.value)} />;
  }
  return <input {...rest} type="text" className="kit-field" onChange={(event) => onValueChange(event.target.value)} />;
}
