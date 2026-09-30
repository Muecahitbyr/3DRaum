import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Meters } from '../../types/room';
import { clamp, formatNumber, parseMeters, roundTo } from '../../utils/units';
import styles from './MeasurementInput.module.css';

interface MeasurementInputProps {
  label: string;
  value: Meters;
  min: Meters;
  max: Meters;
  step: Meters;
  onChange: (value: Meters) => void;
  /** Einheit hinter dem Feld (Standard: Meter). */
  unit?: string;
  /** Angezeigte Nachkommastellen (Standard: 2 → Zentimeter). */
  decimals?: number;
}

/**
 * Zahlenfeld mit Einheit – standardmäßig für Längen in Metern. Gültige Werte werden sofort übernommen,
 * ungültige erst beim Verlassen des Felds korrigiert (begrenzt bzw. zurückgesetzt).
 * Pfeiltasten ↑/↓ verändern den Wert um `step`.
 */
export function MeasurementInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = 'm',
  decimals = 2,
}: MeasurementInputProps) {
  const format = (v: number) => formatNumber(v, decimals);
  const inputId = useId();
  const messageId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const isEditing = draft !== null;
  const parsed = isEditing ? parseMeters(draft) : value;
  const isValid = parsed !== null && parsed >= min && parsed <= max;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    const nextValue = parseMeters(next);
    if (nextValue !== null && nextValue >= min && nextValue <= max) onChange(nextValue);
  };

  const commit = () => {
    if (draft === null) return;
    const nextValue = parseMeters(draft);
    if (nextValue !== null) onChange(clamp(nextValue, min, max));
    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setDraft(null);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const base = parsed ?? value;
      const next = roundTo(clamp(base + (event.key === 'ArrowUp' ? step : -step), min, max), decimals);
      onChange(next);
      setDraft(format(next));
    }
  };

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control} data-invalid={!isValid}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={isEditing ? draft : format(value)}
          onChange={handleChange}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          aria-invalid={!isValid}
          aria-describedby={isValid ? undefined : messageId}
        />
        <span className={styles.unit}>{unit}</span>
      </div>
      {!isValid && (
        <p id={messageId} className={styles.message}>
          Wert zwischen {format(min)} und {format(max)} {unit}
        </p>
      )}
    </div>
  );
}
