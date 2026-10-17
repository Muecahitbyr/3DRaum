import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  testId?: string;
}

interface ContextMenuProps {
  /** Bildschirmposition (Zeiger bzw. Element). */
  x: number;
  y: number;
  /** Überschrift (z. B. Name des Elements). */
  title: string;
  items: readonly ContextMenuItem[];
  onClose: () => void;
  testId?: string;
}

/** Abstand zum Fensterrand (px). */
const EDGE = 8;

/**
 * Kontextmenü an der Zeigerposition (Rechtsklick). Bleibt im Fenster, Fokus auf dem ersten
 * Eintrag; Esc, Klick daneben, Scrollen oder Größenänderung schließen es.
 */
export function ContextMenu({ x, y, title, items, onClose, testId }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onViewChange = () => onClose();
    // Erst nach dem auslösenden Ereignis lauschen (sonst schließt der Rechtsklick selbst das Menü).
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('wheel', onViewChange, { passive: true });
    }, 0);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewChange);
    window.addEventListener('blur', onViewChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('wheel', onViewChange);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewChange);
      window.removeEventListener('blur', onViewChange);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={position}
      role="menu"
      aria-label={title}
      data-testid={testId}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={styles.title} aria-hidden="true">
        {title}
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`${styles.item} ${item.danger ? styles.danger : ''}`}
          data-testid={item.testId}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
