import { useEffect, useLayoutEffect, useRef } from 'react';
import { COPY_OFFSET, groupsWithin, type FurnitureClipboard, type PlannerState, type Selection } from '../state/plannerState';
import type { usePlanner } from './usePlanner';

type Planner = ReturnType<typeof usePlanner>;

/** Eingabefelder, Auswahllisten und Dialoge behalten ihre eigene Tastaturbedienung. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[role="dialog"]')) return true;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

const ARROWS: Record<string, { x: number; z: number }> = {
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
};

/** Transaktion für Pfeiltasten: gedrückt halten = EIN Verlaufsschritt. */
const KEYBOARD_MOVE = 'keyboard-move';

/**
 * Tastenkürzel für die Bearbeitung:
 * - Strg/⌘ + D duplizieren, Strg/⌘ + C/V kopieren/einfügen (Möbel inkl. Gruppen)
 * - Entf/Rücktaste löscht die Auswahl nach Sicherheitsabfrage (`onDelete`: Möbel, Tür/Fenster, Raumobjekt,
 *   Ecke/Wand im Grundriss-Editor)
 * - Pfeiltasten verschieben ausgewählte Möbel um 1 cm, mit Shift um 10 cm
 * Nicht aktiv in Eingabefeldern oder bei offenem Dialog.
 */
export function useEditingShortcuts(planner: Planner, enabled: boolean, onDelete: (selection: Selection) => void) {
  const latest = useRef(planner);
  const deleteRef = useRef(onDelete);
  useLayoutEffect(() => {
    latest.current = planner;
    deleteRef.current = onDelete;
  });
  const clipboard = useRef<{ data: FurnitureClipboard; pastes: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let moving = false;
    const endMove = () => {
      if (!moving) return;
      moving = false;
      latest.current.history.end(KEYBOARD_MOVE);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || isEditableTarget(event.target)) return;
      const { state, actions, history } = latest.current;
      const selection = state.selection;
      const furnitureIds = selection?.kind === 'furniture' ? selection.ids : [];
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'd') {
        event.preventDefault();
        if (furnitureIds.length) actions.duplicateFurniture(furnitureIds);
        return;
      }
      if (mod && key === 'c') {
        if (!furnitureIds.length || hasTextSelection()) return;
        event.preventDefault();
        clipboard.current = { data: copyFurniture(state, furnitureIds), pastes: 0 };
        return;
      }
      if (mod && key === 'v') {
        if (!clipboard.current) return;
        event.preventDefault();
        const entry = clipboard.current;
        entry.pastes += 1;
        // Jede weitere Einfügung etwas weiter versetzt, damit Kopien nicht übereinanderliegen.
        actions.pasteFurniture(entry.data, { x: COPY_OFFSET.x * entry.pastes, z: COPY_OFFSET.z * entry.pastes });
        return;
      }
      if (mod) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selection) return;
        event.preventDefault();
        deleteRef.current(selection);
        return;
      }

      const direction = ARROWS[event.key];
      if (direction && furnitureIds.length) {
        event.preventDefault();
        if (!moving) {
          moving = true;
          history.begin(KEYBOARD_MOVE, 'edit');
        }
        const step = event.shiftKey ? 0.1 : 0.01;
        actions.moveFurniture(furnitureIds, { x: direction.x * step, z: direction.z * step });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (ARROWS[event.key]) endMove();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', endMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', endMove);
      endMove();
    };
  }, [enabled]);
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
}

function copyFurniture(state: PlannerState, ids: readonly string[]): FurnitureClipboard {
  return {
    items: state.furniture.filter((f) => ids.includes(f.id)).map((f) => ({ ...f, position: { ...f.position } })),
    groups: groupsWithin(state.groups, ids),
  };
}
