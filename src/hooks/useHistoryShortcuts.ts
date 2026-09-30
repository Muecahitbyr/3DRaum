import { useEffect } from 'react';
import type { PlannerHistory } from './usePlanner';

/** In Textfeldern gilt das native Rückgängig des Browsers. */
function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Tastenkürzel: Strg/Cmd + Z = Rückgängig, Strg/Cmd + Shift + Z = Wiederholen
 * (zusätzlich Strg + Y unter Windows/Linux).
 */
export function useHistoryShortcuts(history: Pick<PlannerHistory, 'undo' | 'redo'>, enabled = true) {
  const { undo, redo } = history;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isTextEditing(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y' && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, enabled]);
}
