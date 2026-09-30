import type { PlannerHistory } from '../../hooks/usePlanner';
import styles from './HistoryControls.module.css';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUTS = IS_MAC ? { undo: '⌘Z', redo: '⇧⌘Z' } : { undo: 'Strg+Z', redo: 'Strg+Umschalt+Z' };

/** Rückgängig/Wiederholen; der Tooltip nennt die nächste Aktion, z. B. „Möbel verschieben rückgängig“. */
export function HistoryControls({ history }: { history: PlannerHistory }) {
  const undoTitle = history.undoLabel ? `${history.undoLabel} rückgängig` : 'Nichts rückgängig zu machen';
  const redoTitle = history.redoLabel ? `${history.redoLabel} wiederholen` : 'Nichts zu wiederholen';

  return (
    <div className={styles.group} role="group" aria-label="Verlauf">
      <button
        type="button"
        className={styles.button}
        onClick={history.undo}
        disabled={!history.canUndo}
        aria-label="Rückgängig"
        title={`${undoTitle} (${SHORTCUTS.undo})`}
        data-testid="history-undo"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5.5 3.5 2.5 6.5l3 3" />
          <path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={history.redo}
        disabled={!history.canRedo}
        aria-label="Wiederholen"
        title={`${redoTitle} (${SHORTCUTS.redo})`}
        data-testid="history-redo"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m10.5 3.5 3 3-3 3" />
          <path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9" />
        </svg>
      </button>
    </div>
  );
}
