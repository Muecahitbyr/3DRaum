import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import styles from './Dialog.module.css';

/** Offene Dialoge (oberster zuletzt) – Esc schließt nur den obersten. */
const openDialogs: string[] = [];

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  testId?: string;
}

/**
 * Modaler Dialog: Esc/Klick daneben schließt, der Fokus springt beim Öffnen in den
 * Dialog (Element mit `data-autofocus` bzw. erstes Eingabefeld) und danach zurück.
 */
export function Dialog({ title, onClose, children, footer, width = 460, testId }: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    openDialogs.push(id);
    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('input') ?? panel;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== id) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(id), 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [id]);

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ '--dialog-width': `${width}px` } as CSSProperties}
        data-testid={testId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button variant="icon" onClick={onClose} aria-label="Schließen" title="Schließen">
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="m3 3 8 8M11 3l-8 8" />
            </svg>
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
