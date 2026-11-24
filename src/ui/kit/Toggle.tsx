interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** An on/off switch: a button with `role="switch"`, in place of a checkbox. */
export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="kit-toggle" onClick={() => onChange(!checked)}>
      <span className="kit-toggle-knob" aria-hidden="true" />
      {label}
    </button>
  );
}
