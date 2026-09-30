import type { FocusEventHandler, ReactNode } from 'react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  children: ReactNode;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
}

export function Sidebar({ children, onFocusCapture, onBlurCapture }: SidebarProps) {
  return (
    <div className={styles.sidebar} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture}>
      <header className={styles.header}>
        <span className={styles.logo} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M6 22 16 27.5 26 22V10L16 4.5 6 10z" />
            <path d="M6 10 16 15.5 26 10M16 15.5v12" />
          </svg>
        </span>
        <h1 className={styles.title}>Raumplaner</h1>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
