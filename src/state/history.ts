import { FIXTURE_CATALOG } from '../config/fixtures';
import { isLamp } from '../config/furniture';
import type { FixturePatch } from '../types/fixture';
import type { FurniturePatch } from '../types/furniture';
import type { Opening, OpeningPatch } from '../types/opening';
import { sameItems, sameValues } from '../utils/equality';
import { initialPlannerState, plannerReducer, type PlannerAction, type PlannerState } from './plannerState';

/** Maximale Anzahl gespeicherter Schritte. */
export const HISTORY_LIMIT = 100;

/**
 * Der rückgängig machbare Teil des Plans. Auswahl, Kamera, Ansicht und ID-Zähler
 * gehören bewusst nicht dazu (IDs werden nie wiederverwendet).
 */
export type PlanDocument = Pick<PlannerState, 'room' | 'openings' | 'furniture' | 'fixtures' | 'groups' | 'design'>;

export interface HistoryEntry {
  /** Bezeichnung der Änderung, z. B. „Möbel verschieben“. */
  label: string;
  /** Vergangenheit: Stand VOR der Änderung. Zukunft: Stand NACH der Änderung. */
  document: PlanDocument;
}

/**
 * `gesture` (Ziehen, Drehen) blockiert Undo/Redo, solange sie läuft.
 * `edit` (Feld fokussiert) wird von Undo/Redo zuerst abgeschlossen.
 */
export type TransactionKind = 'gesture' | 'edit';

interface Transaction {
  id: string;
  kind: TransactionKind;
  before: PlanDocument;
  label: string | null;
}

export interface HistoryState {
  present: PlannerState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Offene Gruppe (Ziehen, Drehen, Feldbearbeitung): wird als EIN Schritt gespeichert. */
  transaction: Transaction | null;
}

export type HistoryAction =
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  /** Startet eine Gruppe; eine noch offene andere Gruppe wird vorher abgeschlossen. */
  | { type: 'history/begin'; id: string; kind: TransactionKind }
  /** Schließt die Gruppe mit dieser ID (andere IDs werden ignoriert). */
  | { type: 'history/end'; id: string }
  /** Neuer Plan (Projekt öffnen / neues Projekt): Verlauf und Auswahl werden zurückgesetzt. */
  | { type: 'history/reset'; document: PlanDocument };

export const initialHistoryState: HistoryState = {
  present: initialPlannerState,
  past: [],
  future: [],
  transaction: null,
};

export const documentOf = ({ room, openings, furniture, fixtures, groups, design }: PlannerState): PlanDocument => ({
  room,
  openings,
  furniture,
  fixtures,
  groups,
  design,
});

/**
 * Gleicher Planstand nach Werten. Wichtig z. B. bei Esc während einer Geste:
 * Die Rücksetzung erzeugt neue Objekte mit den alten Werten – das ist keine Änderung.
 */
export const sameDocument = (a: PlanDocument, b: PlanDocument) =>
  (a.room === b.room || sameValues(a.room, b.room)) &&
  sameItems(a.openings, b.openings) &&
  sameItems(a.furniture, b.furniture) &&
  sameItems(a.fixtures, b.fixtures) &&
  sameItems(a.groups, b.groups) &&
  (a.design === b.design || sameValues(a.design, b.design));

/** Setzt einen Dokumentstand ein; eine Auswahl bleibt nur, wenn das Objekt noch existiert. */
function restore(present: PlannerState, document: PlanDocument): PlannerState {
  const { selection } = present;
  if (!selection) return { ...present, ...document };
  if (selection.kind === 'furniture') {
    const ids = selection.ids.filter((id) => document.furniture.some((f) => f.id === id));
    const next =
      ids.length === 0 ? null : ids.length === selection.ids.length ? selection : { ...selection, id: ids.includes(selection.id) ? selection.id : ids[0], ids };
    return { ...present, ...document, selection: next };
  }
  const items: readonly { id: string }[] =
    selection.kind === 'opening' ? document.openings : selection.kind === 'fixture' ? document.fixtures : document.room.walls;
  return { ...present, ...document, selection: items.some((o) => o.id === selection.id) ? selection : null };
}

/** Nächste freie laufende Nummer für IDs wie `opening-7`, damit neue IDs nicht kollidieren. */
function nextNumber(items: readonly { id: string }[], prefix: string): number {
  let max = 0;
  for (const { id } of items) {
    const match = id.startsWith(prefix) ? /^\d+$/.exec(id.slice(prefix.length)) : null;
    if (match) max = Math.max(max, Number(match[0]));
  }
  return max + 1;
}

const pushPast = (past: HistoryEntry[], entry: HistoryEntry) => [...past, entry].slice(-HISTORY_LIMIT);

const OPENING_NAMES = { door: 'Tür', window: 'Fenster', passage: 'Durchgang' } as const;
const OPENING_SIZE_LABELS = { door: 'Türmaße ändern', window: 'Fenstermaße ändern', passage: 'Durchgangsmaße ändern' } as const;

function openingPatchLabel(opening: Opening | undefined, patch: OpeningPatch): string {
  const kind = opening ? OPENING_NAMES[opening.type] : 'Element';
  // Breitenänderung kann den Versatz mitführen (linke Kante bleibt stehen) – das ist kein Verschieben.
  if ('wall' in patch || ('offset' in patch && !('width' in patch))) return `${kind} verschieben`;
  if ('hinge' in patch) return 'Türanschlag ändern';
  if ('swing' in patch) return 'Öffnungsrichtung ändern';
  if ('sashes' in patch) return 'Fensterart ändern';
  return opening ? OPENING_SIZE_LABELS[opening.type] : 'Elementmaße ändern';
}

function fixturePatchLabel(label: string, patch: FixturePatch): string {
  if ('wall' in patch || ('offset' in patch && !('width' in patch))) return `${label} verschieben`;
  return `${label} ändern`;
}

function furniturePatchLabel(patch: FurniturePatch): string {
  if ('colors' in patch) return 'Möbelfarbe ändern';
  if ('light' in patch) return 'Lampe einstellen';
  if ('elevation' in patch) return 'Standhöhe ändern';
  if ('rotationDeg' in patch) return 'Möbel drehen';
  if ('position' in patch) return 'Möbel verschieben';
  if ('name' in patch) return 'Möbelname ändern';
  return 'Möbelmaße ändern';
}

/** Bezeichnung einer dokumentverändernden Aktion für Verlauf und Tooltips. */
export function describeAction(action: PlannerAction, state: PlannerState): string {
  switch (action.type) {
    case 'setRoomDimension':
      return 'Raummaße ändern';
    case 'setRoomShape':
      return 'Raumform ändern';
    case 'setLShapeDimensions':
      return 'Raummaße ändern';
    case 'moveCorner':
      return 'Ecke verschieben';
    case 'setWallLength':
      return 'Wandlänge ändern';
    case 'setWallThickness':
      return 'Wandstärke ändern';
    case 'splitWall':
      return 'Ecke einfügen';
    case 'removeCorner':
      return 'Ecke entfernen';
    case 'removeWall':
      return 'Wand entfernen';
    case 'addOpening':
      return `${OPENING_NAMES[action.openingType]} hinzufügen`;
    case 'removeOpening': {
      const opening = state.openings.find((o) => o.id === action.id);
      return `${opening ? OPENING_NAMES[opening.type] : 'Element'} löschen`;
    }
    case 'updateOpening': {
      return openingPatchLabel(state.openings.find((o) => o.id === action.id), action.patch);
    }
    case 'addFurniture':
      return isLamp(action.furnitureType) ? 'Lampe hinzufügen' : 'Möbel hinzufügen';
    case 'removeFurnitureMany': {
      const items = state.furniture.filter((f) => action.ids.includes(f.id));
      if (items.length > 0 && items.every((f) => isLamp(f.type))) return items.length === 1 ? 'Lampe löschen' : 'Lampen löschen';
      return 'Möbel löschen';
    }
    case 'duplicateFurniture':
      return 'Möbel duplizieren';
    case 'pasteFurniture':
      return 'Möbel einfügen';
    case 'moveFurniture':
    case 'setFurniturePositions':
      return 'Möbel verschieben';
    case 'alignFurniture':
      return 'Möbel ausrichten';
    case 'setFurnitureTransforms':
    case 'rotateFurnitureMany':
      return 'Möbel drehen';
    case 'renameGroup':
      return 'Gruppe umbenennen';
    case 'groupFurniture':
      return 'Möbel gruppieren';
    case 'ungroupFurniture':
      return 'Gruppe auflösen';
    case 'addFixture':
      return `${FIXTURE_CATALOG[action.fixtureType].label} hinzufügen`;
    case 'updateFixture': {
      const fixture = state.fixtures.find((f) => f.id === action.id);
      return fixturePatchLabel(fixture ? FIXTURE_CATALOG[fixture.type].label : 'Raumobjekt', action.patch);
    }
    case 'removeFixture': {
      const fixture = state.fixtures.find((f) => f.id === action.id);
      return `${fixture ? FIXTURE_CATALOG[fixture.type].label : 'Raumobjekt'} löschen`;
    }
    case 'updateFurniture':
      return furniturePatchLabel(action.patch);
    case 'removeFurniture': {
      const item = state.furniture.find((f) => f.id === action.id);
      return item && isLamp(item.type) ? 'Lampe löschen' : 'Möbel löschen';
    }
    case 'setFloorMaterial':
      return 'Bodenbelag ändern';
    case 'setWallColor':
      return 'Wandfarbe ändern';
    case 'setAllWallColors':
      return 'Alle Wände färben';
    case 'setWallFinish':
      return 'Wandoberfläche ändern';
    case 'setAllWallFinishes':
      return 'Alle Wandoberflächen ändern';
    case 'setCeilingColor':
      return 'Deckenfarbe ändern';
    case 'setLighting':
      return 'preset' in action.patch ? 'Lichtstimmung ändern' : 'Helligkeit ändern';
    case 'select':
    case 'selectFurniture':
    case 'selectFurnitureMany':
      return 'Auswahl';
  }
}

/** Schließt eine offene Gruppe ab: Hat sie das Dokument verändert, entsteht ein Schritt. */
function closeTransaction(state: HistoryState): HistoryState {
  const { transaction } = state;
  if (!transaction) return state;
  const changed = !sameDocument(transaction.before, documentOf(state.present));
  return {
    ...state,
    transaction: null,
    past: changed ? pushPast(state.past, { label: transaction.label ?? 'Änderung', document: transaction.before }) : state.past,
    future: changed ? [] : state.future,
  };
}

/**
 * Verlauf um den Planungs-Reducer: speichert Dokumentstände vor jeder Änderung,
 * fasst Gruppen (Transaktionen) zu einem Schritt zusammen und verwirft den
 * Redo-Verlauf bei jeder neuen Änderung.
 */
export function historyReducer(state: HistoryState, action: PlannerAction | HistoryAction): HistoryState {
  switch (action.type) {
    case 'history/begin': {
      if (state.transaction?.id === action.id) return state;
      const closed = closeTransaction(state);
      return { ...closed, transaction: { id: action.id, kind: action.kind, before: documentOf(closed.present), label: null } };
    }

    case 'history/end':
      return state.transaction?.id === action.id ? closeTransaction(state) : state;

    case 'history/reset':
      return {
        present: {
          ...state.present,
          ...action.document,
          selection: null,
          nextOpeningNumber: nextNumber(action.document.openings, 'opening-'),
          nextFurnitureNumber: nextNumber(action.document.furniture, 'furniture-'),
          nextFixtureNumber: nextNumber(action.document.fixtures, 'fixture-'),
          nextGroupNumber: nextNumber(action.document.groups, 'group-'),
        },
        past: [],
        future: [],
        transaction: null,
      };

    case 'history/undo': {
      // Während einer laufenden Geste nicht eingreifen; eine Feldbearbeitung zuerst abschließen.
      if (state.transaction?.kind === 'gesture') return state;
      state = closeTransaction(state);
      if (state.past.length === 0) return state;
      const entry = state.past[state.past.length - 1];
      return {
        present: restore(state.present, entry.document),
        past: state.past.slice(0, -1),
        future: [{ label: entry.label, document: documentOf(state.present) }, ...state.future],
        transaction: null,
      };
    }

    case 'history/redo': {
      if (state.transaction?.kind === 'gesture') return state;
      state = closeTransaction(state);
      if (state.future.length === 0) return state;
      const [entry, ...rest] = state.future;
      return {
        present: restore(state.present, entry.document),
        past: pushPast(state.past, { label: entry.label, document: documentOf(state.present) }),
        future: rest,
        transaction: null,
      };
    }

    default: {
      const next = plannerReducer(state.present, action);
      if (next === state.present) return state;
      const before = documentOf(state.present);
      // Nur Auswahl geändert → kein Verlaufsschritt.
      if (sameDocument(before, documentOf(next))) return { ...state, present: next };

      const label = describeAction(action, state.present);
      if (state.transaction) {
        return {
          ...state,
          present: next,
          transaction: { ...state.transaction, label: state.transaction.label ?? label },
        };
      }
      return { present: next, past: pushPast(state.past, { label, document: before }), future: [], transaction: null };
    }
  }
}
