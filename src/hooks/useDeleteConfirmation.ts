import { useCallback, useMemo, useState } from 'react';
import type { ConfirmRequest } from '../components/projects/ConfirmDialog';
import { FIXTURE_CATALOG } from '../config/fixtures';
import { isLamp } from '../config/furniture';
import type { Selection } from '../state/plannerState';
import { getFixtureDisplayName } from '../utils/fixtures';
import { getOpeningDisplayName } from '../utils/openingLabels';
import { roomModelOf } from '../utils/room/model';
import type { usePlanner } from './usePlanner';

type Planner = ReturnType<typeof usePlanner>;

const UNDO_HINT = 'Mit „Rückgängig“ (Strg/⌘ + Z) lässt sich das wiederherstellen.';
const OPENING_TITLES = { door: 'Tür löschen?', window: 'Fenster löschen?', passage: 'Durchgang löschen?' } as const;
const quoted = (name: string) => `„${name.trim() || 'Ohne Namen'}“`;

/**
 * Sicherheitsabfrage vor jedem Löschen (Bauelemente, Raumobjekte, Möbel, Zimmer, Etagen,
 * Wände und Ecken): Die Lösch-Funktionen öffnen nur die Abfrage; gelöscht wird erst nach
 * „Löschen“. Abbrechen ändert nichts.
 */
export function useDeleteConfirmation(planner: Planner) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const { state, actions } = planner;
  const ask = useCallback(
    (title: string, message: string, onConfirm: () => void, confirmLabel = 'Löschen') =>
      setRequest({ title, message: `${message} ${UNDO_HINT}`, confirmLabel, danger: true, onConfirm }),
    [],
  );

  const deleteOpening = (id: string) => {
    const opening = state.openings.find((o) => o.id === id);
    if (!opening) return;
    ask(OPENING_TITLES[opening.type], `${quoted(getOpeningDisplayName(opening, state.openings))} wird gelöscht.`, () => actions.removeOpening(id));
  };

  const deleteFixture = (id: string) => {
    const fixture = state.fixtures.find((f) => f.id === id);
    if (!fixture) return;
    ask(`${FIXTURE_CATALOG[fixture.type].label} löschen?`, `${quoted(getFixtureDisplayName(fixture, state.fixtures))} wird gelöscht.`, () => actions.removeFixture(id));
  };

  const deleteFurniture = (ids: readonly string[]) => {
    const items = state.furniture.filter((f) => ids.includes(f.id));
    if (items.length === 0) return;
    const remove = () => actions.removeFurnitureMany(items.map((f) => f.id));
    if (items.length === 1) {
      ask(isLamp(items[0].type) ? 'Lampe löschen?' : 'Möbel löschen?', `${quoted(items[0].name)} wird gelöscht.`, remove);
      return;
    }
    const lamps = items.every((f) => isLamp(f.type));
    ask(`${items.length} ${lamps ? 'Lampen' : 'Möbel'} löschen?`, `Die ${items.length} ausgewählten ${lamps ? 'Lampen' : 'Möbel'} werden gelöscht.`, remove);
  };

  const deleteRoom = (id: string) => {
    const room = state.building.rooms.find((r) => r.id === id);
    if (!room || state.building.rooms.length <= 1) return;
    ask('Zimmer löschen?', `${quoted(room.name)} wird mit allen Möbeln, Türen, Fenstern und Raumobjekten gelöscht.`, () => actions.removeRoom(id));
  };

  const deleteFloor = (id: string) => {
    const floor = state.building.floors.find((f) => f.id === id);
    if (!floor || state.building.floors.length <= 1) return;
    const count = state.building.rooms.filter((r) => r.floorId === id).length;
    ask('Etage löschen?', `${quoted(floor.name)} wird mit ${count === 1 ? 'ihrem Zimmer' : `allen ${count} Zimmern`} und deren Inhalt gelöscht.`, () => actions.removeFloor(id));
  };

  const removeWall = (id: string) => {
    const wall = roomModelOf(state.room).wallById.get(id);
    if (!wall) return;
    ask('Wand entfernen?', `${quoted(wall.label)} wird entfernt; die Nachbarwände werden verbunden.`, () => actions.removeWall(id), 'Entfernen');
  };

  const removeCorner = (id: string) => {
    const wall = roomModelOf(state.room).wallById.get(id);
    if (!wall) return;
    ask('Ecke entfernen?', `Ecke ${wall.index + 1} wird entfernt; die beiden Wände werden zu einer.`, () => actions.removeCorner(id), 'Entfernen');
  };

  /** Entf/Rücktaste: Abfrage für die aktuelle Auswahl. */
  const deleteSelection = (selection: Selection) => {
    if (selection.kind === 'furniture') deleteFurniture(selection.ids);
    else if (selection.kind === 'opening') deleteOpening(selection.id);
    else if (selection.kind === 'fixture') deleteFixture(selection.id);
    else if (selection.kind === 'corner') removeCorner(selection.id);
    else removeWall(selection.id);
  };

  const close = useMemo(() => () => setRequest(null), []);
  return { request, close, deleteOpening, deleteFixture, deleteFurniture, deleteRoom, deleteFloor, removeWall, removeCorner, deleteSelection };
}
