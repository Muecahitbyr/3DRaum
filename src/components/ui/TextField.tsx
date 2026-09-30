import { useId } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps {
  label: string;
  value: string;
  maxLength?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextField({ label, value, maxLength = 40, placeholder, onChange }: TextFieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // In Formularen (z. B. Dialogen) soll Enter absenden, sonst das Feld verlassen.
          if (event.key === 'Enter' && !event.currentTarget.form) event.currentTarget.blur();
        }}
      />
    </div>
  );
}
