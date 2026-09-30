import { SIDEBAR_ID } from './PlannerLayout';
import styles from './MenuButton.module.css';

/** Öffnet/schließt die Seitenleiste auf schmalen Bildschirmen. */
export function MenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.menu}
      onClick={onClick}
      aria-expanded={open}
      aria-controls={SIDEBAR_ID}
      aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
      title="Raum, Bauelemente, Möbel und Gestaltung"
      data-testid="menu-button"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M3 5h12M3 9h12M3 13h12" />
      </svg>
    </button>
  );
}
