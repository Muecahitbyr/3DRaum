import { useId, type ReactNode } from 'react';
import styles from './SidebarSection.module.css';

interface SidebarSectionProps {
  title: string;
  /** Optionales Element rechts neben der Überschrift (z. B. Schließen-Button). */
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}

export function SidebarSection({ title, action, children, testId }: SidebarSectionProps) {
  const headingId = useId();

  return (
    <section className={styles.section} aria-labelledby={headingId} data-testid={testId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {title}
        </h2>
        {action}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
