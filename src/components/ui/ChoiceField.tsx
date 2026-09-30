import { SegmentedControl, type SegmentedOption } from './SegmentedControl';
import styles from './MeasurementInput.module.css';

interface ChoiceFieldProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}

/** Beschriftete Auswahl weniger Optionen (z. B. Türanschlag links/rechts). */
export function ChoiceField<T extends string>({ label, options, value, onChange, testId }: ChoiceFieldProps<T>) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <SegmentedControl label={label} options={options} value={value} onChange={onChange} variant="field" testId={testId} />
    </div>
  );
}
