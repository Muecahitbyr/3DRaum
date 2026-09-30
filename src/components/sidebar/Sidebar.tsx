import type { FocusEventHandler, ReactNode } from 'react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  children: ReactNode;
  /** Projektname und Speicherstatus (auch auf schmalen Bildschirmen immer sichtbar). */
  project?: { name: string; status: string };
  /** Schmale Bildschirme: Drawer schließen. */
  onClose?: () => void;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
}

export function Sidebar({ children, onFocusCapture, onBlurCapture, project, onClose }: SidebarProps) {
  return (
    <div className={styles.sidebar} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture}>
      <header className={styles.header}>
        <span className={styles.logo} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M6 22 16 27.5 26 22V10L16 4.5 6 10z" />
            <path d="M6 10 16 15.5 26 10M16 15.5v12" />
          </svg>
        </span>
        <div className={styles.titles}>
          <h1 className={styles.title}>Raumplaner</h1>
          {project && (
            <p className={styles.project} data-testid="sidebar-project" title={project.name}>
              {project.name} · {project.status}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Menü schließen" title="Menü schließen" data-testid="drawer-close">
            <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
