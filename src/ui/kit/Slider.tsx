interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
}

/** A styled range input. */
export default function Slider({ value, min, max, step = 1, onChange, label }: SliderProps) {
  return (
    <input
      type="range"
      className="kit-slider"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}
