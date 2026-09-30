import type { ReactNode } from 'react';
import styles from './PlannerLayout.module.css';

interface PlannerLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function PlannerLayout({ sidebar, children }: PlannerLayoutProps) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.workspace}>{children}</main>
    </div>
  );
}
