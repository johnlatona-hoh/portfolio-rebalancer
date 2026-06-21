import { useEffect, useState } from "react";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
  title?: string;
}

/**
 * Numeric input that allows free typing. It holds a local string buffer so the field can be
 * cleared or hold a partial / below-min value while you type (e.g. "5" on the way to "55"),
 * instead of silently rejecting the keystroke. A valid in-range value commits immediately
 * (so the up/down steppers still work), and on blur/Enter the entry is clamped to [min, max]
 * — or reverted to the last valid value if it's blank/non-numeric.
 */
export default function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  className,
  ...rest
}: Props) {
  const [buf, setBuf] = useState(String(value));

  // Sync the buffer when the value changes from outside (reset, stepper on a sibling, etc.),
  // but don't clobber what the user is mid-typing when it already parses to the same number.
  useEffect(() => {
    setBuf((prev) => (parseFloat(prev) === value ? prev : String(value)));
  }, [value]);

  function inRange(v: number) {
    return (min === undefined || v >= min) && (max === undefined || v <= max);
  }

  function handleChange(raw: string) {
    setBuf(raw);
    const v = parseFloat(raw);
    // Commit immediately for a complete, in-range value (covers steppers and finished typing);
    // partial / out-of-range entries stay buffered until blur.
    if (!isNaN(v) && inRange(v)) onChange(v);
  }

  function commit() {
    const v = parseFloat(buf);
    if (isNaN(v)) {
      setBuf(String(value));
      return;
    }
    let clamped = v;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    if (clamped !== value) onChange(clamped);
    setBuf(String(clamped));
  }

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={buf}
      min={min}
      max={max}
      step={step}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
