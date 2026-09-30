import { useEffect, useRef, type ReactNode } from 'react';
import styles from './PlannerLayout.module.css';

interface PlannerLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Schmale Bildschirme: Sidebar als Drawer über der Arbeitsfläche. */
  compact: boolean;
  drawerOpen: boolean;
  onDrawerClose: () => void;
}

export const SIDEBAR_ID = 'planner-sidebar';

/**
 * Grundlayout: Sidebar links, Arbeitsfläche rechts. Auf schmalen Bildschirmen wird
 * die Sidebar zum ausklappbaren Panel (Esc oder Tipp daneben schließt), damit die
 * Arbeitsfläche maximal groß bleibt.
 */
export function PlannerLayout({ sidebar, children, compact, drawerOpen, onDrawerClose }: PlannerLayoutProps) {
  const asideRef = useRef<HTMLElement>(null);
  const open = compact && drawerOpen;

  const onCloseRef = useRef(onDrawerClose);
  useEffect(() => {
    onCloseRef.current = onDrawerClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc schließt den Drawer – aber nicht, wenn ein Dialog offen ist (der schließt zuerst).
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    asideRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      // Fokus zurück (z. B. zum Menü-Button), sobald die Arbeitsfläche wieder bedienbar ist.
      requestAnimationFrame(() => {
        if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
      });
    };
  }, [open]);

  return (
    <div className={styles.layout} data-compact={compact} data-drawer={open}>
      <aside
        ref={asideRef}
        id={SIDEBAR_ID}
        className={styles.sidebar}
        tabIndex={-1}
        aria-label="Planungswerkzeuge"
        // Geschlossener Drawer: nicht per Tab erreichbar und für Screenreader verborgen.
        inert={compact && !drawerOpen ? true : undefined}
        aria-hidden={compact && !drawerOpen ? true : undefined}
        data-testid="sidebar"
      >
        {sidebar}
      </aside>
      {open && <div className={styles.scrim} onClick={onDrawerClose} data-testid="drawer-scrim" aria-hidden="true" />}
      {/* Offener Drawer ist modal: die Arbeitsfläche dahinter ist nicht per Tab erreichbar. */}
      <main className={styles.workspace} inert={open ? true : undefined}>
        {children}
      </main>
    </div>
  );
}
