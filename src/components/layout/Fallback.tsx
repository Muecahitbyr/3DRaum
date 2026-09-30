import { Button } from '../ui/Button';
import styles from './Fallback.module.css';

interface FallbackProps {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  testId?: string;
}

/** Verständliche Ersatzanzeige statt einer leeren Seite (z. B. ohne WebGL oder nach einem Fehler). */
export function Fallback({ title, message, action, testId }: FallbackProps) {
  return (
    <div className={styles.fallback} role="alert" data-testid={testId}>
      <div className={styles.card}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        {action && (
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
