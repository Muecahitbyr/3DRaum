import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `toolbar`: schwebende Leiste (Ansicht), `field`: volle Breite im Formular. */
  variant?: 'toolbar' | 'field';
  testId?: string;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'toolbar',
  testId,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={variant === 'field' ? `${styles.group} ${styles.field}` : styles.group}
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={option.value === value}
          data-value={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
