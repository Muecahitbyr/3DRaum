import { useMemo, useReducer } from 'react';
import {
  documentOf,
  historyReducer,
  initialHistoryState,
  sameDocument,
  type PlanDocument,
  type TransactionKind,
} from '../state/history';
import type { FurnitureClipboard, FurniturePickMode } from '../state/plannerState';
import type { FloorMaterialId, HexColor, LightingSettings, WallFinish } from '../types/design';
import type { FixturePatch, FixtureType } from '../types/fixture';
import type { FurniturePatch, FurnitureType } from '../types/furniture';
import type { OpeningPatch, OpeningType } from '../types/opening';
import type { FloorPoint, Meters, RoomDimensionKey, RoomShape } from '../types/room';
import { roomModelOf } from '../utils/room/model';
import type { AlignMode } from '../utils/furnitureFormation';
import type { LShapeDimensions } from '../utils/room/plan';

/** Planungszustand mit Verlauf + stabile Aktionen für Komponenten. */
export function usePlanner() {
  const [history, dispatch] = useReducer(historyReducer, initialHistoryState);
  const state = history.present;

  const actions = useMemo(
    () => ({
      setRoomDimension: (key: RoomDimensionKey, value: Meters) =>
        dispatch({ type: 'setRoomDimension', key, value }),
      /** Neuen Raum der gewählten Form anlegen (Vorlage). */
      setRoomShape: (shape: RoomShape) => dispatch({ type: 'setRoomShape', shape }),
      /** Hauptmaße der L-Form (Gesamtbreite/-länge, Ausschnitt). */
      setLShapeDimensions: (dimensions: Partial<LShapeDimensions>) => dispatch({ type: 'setLShapeDimensions', dimensions }),
      /** Ecke am Anfang der Wand verschieben (Grundrisskoordinaten). */
      moveCorner: (wallId: string, point: FloorPoint) => dispatch({ type: 'moveCorner', wallId, point }),
      setWallLength: (wallId: string, length: Meters) => dispatch({ type: 'setWallLength', wallId, length }),
      setWallThickness: (wallId: string, thickness: Meters) => dispatch({ type: 'setWallThickness', wallId, thickness }),
      splitWall: (wallId: string) => dispatch({ type: 'splitWall', wallId }),
      removeCorner: (wallId: string) => dispatch({ type: 'removeCorner', wallId }),
      removeWall: (wallId: string) => dispatch({ type: 'removeWall', wallId }),
      selectWall: (id: string | null) => dispatch({ type: 'select', selection: id ? { kind: 'wall', id } : null }),
      selectCorner: (id: string | null) => dispatch({ type: 'select', selection: id ? { kind: 'corner', id } : null }),
      addOpening: (openingType: OpeningType) => dispatch({ type: 'addOpening', openingType }),
      updateOpening: (id: string, patch: OpeningPatch) => dispatch({ type: 'updateOpening', id, patch }),
      removeOpening: (id: string) => dispatch({ type: 'removeOpening', id }),
      addFurniture: (furnitureType: FurnitureType) => dispatch({ type: 'addFurniture', furnitureType }),
      updateFurniture: (id: string, patch: FurniturePatch) => dispatch({ type: 'updateFurniture', id, patch }),
      removeFurniture: (id: string) => dispatch({ type: 'removeFurniture', id }),
      removeFurnitureMany: (ids: string[]) => dispatch({ type: 'removeFurnitureMany', ids }),
      duplicateFurniture: (ids: string[]) => dispatch({ type: 'duplicateFurniture', ids }),
      pasteFurniture: (clipboard: FurnitureClipboard, offset: FloorPoint) => dispatch({ type: 'pasteFurniture', clipboard, offset }),
      /** Gemeinsame Verschiebung; die Formation bleibt vollständig im Raum. */
      moveFurniture: (ids: string[], delta: FloorPoint) => dispatch({ type: 'moveFurniture', ids, delta }),
      setFurniturePositions: (positions: Record<string, FloorPoint>) => dispatch({ type: 'setFurniturePositions', positions }),
      alignFurniture: (ids: string[], mode: AlignMode) => dispatch({ type: 'alignFurniture', ids, mode }),
      groupFurniture: (ids: string[]) => dispatch({ type: 'groupFurniture', ids }),
      ungroupFurniture: (groupId: string) => dispatch({ type: 'ungroupFurniture', groupId }),
      addFixture: (fixtureType: FixtureType) => dispatch({ type: 'addFixture', fixtureType }),
      updateFixture: (id: string, patch: FixturePatch) => dispatch({ type: 'updateFixture', id, patch }),
      removeFixture: (id: string) => dispatch({ type: 'removeFixture', id }),
      setFloorMaterial: (floor: FloorMaterialId) => dispatch({ type: 'setFloorMaterial', floor }),
      setWallColor: (wallId: string, color: HexColor) => dispatch({ type: 'setWallColor', side: wallId, color }),
      setAllWallColors: (color: HexColor) => dispatch({ type: 'setAllWallColors', color }),
      setWallFinish: (wallId: string, finish: WallFinish) => dispatch({ type: 'setWallFinish', wallId, finish }),
      setAllWallFinishes: (finish: WallFinish) => dispatch({ type: 'setAllWallFinishes', finish }),
      setCeilingColor: (color: HexColor) => dispatch({ type: 'setCeilingColor', color }),
      setLighting: (patch: Partial<LightingSettings>) => dispatch({ type: 'setLighting', patch }),
      /** Wählt eine Öffnung aus; `null` hebt jede Auswahl auf. */
      selectOpening: (id: string | null) =>
        dispatch({ type: 'select', selection: id ? { kind: 'opening', id } : null }),
      /** Wählt genau ein Möbelstück aus; `null` hebt jede Auswahl auf. */
      selectFurniture: (id: string | null) =>
        dispatch({ type: 'select', selection: id ? { kind: 'furniture', id, ids: [id] } : null }),
      /**
       * Auswahl aus der Szene: `toggle` (Shift) ergänzt/entfernt, `expandGroup`
       * wählt die ganze Gruppe des Möbels mit aus.
       */
      pickFurniture: (id: string, mode: FurniturePickMode, expandGroup = true) =>
        dispatch({ type: 'selectFurniture', id, mode, expandGroup }),
      /** Auswahlrahmen: genau diese Möbel (inkl. ihrer Gruppen) auswählen. */
      selectFurnitureMany: (ids: string[]) => dispatch({ type: 'selectFurnitureMany', ids }),
      /** Wählt ein Raumobjekt aus; `null` hebt jede Auswahl auf. */
      selectFixture: (id: string | null) => dispatch({ type: 'select', selection: id ? { kind: 'fixture', id } : null }),
    }),
    [],
  );

  const historyActions = useMemo(
    () => ({
      undo: () => dispatch({ type: 'history/undo' }),
      redo: () => dispatch({ type: 'history/redo' }),
      /** Mehrere Änderungen (Geste, Feldbearbeitung) als EINEN Schritt zusammenfassen. */
      begin: (id: string, kind: TransactionKind) => dispatch({ type: 'history/begin', id, kind }),
      end: (id: string) => dispatch({ type: 'history/end', id }),
      /** Kompletten Plan laden (Projekt öffnen/neu); leert Verlauf und Auswahl. */
      reset: (document: PlanDocument) => dispatch({ type: 'history/reset', document }),
    }),
    [],
  );

  const { selection } = state;
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : null;
  const selectedFurnitureId = selection?.kind === 'furniture' ? selection.id : null;
  const selectedFixtureId = selection?.kind === 'fixture' ? selection.id : null;
  const selectedFurnitureIds = useMemo(() => (selection?.kind === 'furniture' ? selection.ids : []), [selection]);

  return {
    state,
    /** Abgeleitetes Raummodell (Wände, Umriss, Hülle) – gecacht je Raumstand. */
    room: roomModelOf(state.room),
    selectedWallId: selection?.kind === 'wall' ? selection.id : null,
    selectedCornerId: selection?.kind === 'corner' ? selection.id : null,
    /** Aktueller Plan ohne UI-Zustand (für Speichern und „ungespeichert“-Erkennung). */
    document: useMemo(() => documentOf(state), [state]),
    selectedOpeningId,
    selectedFurnitureId,
    selectedOpening: state.openings.find((o) => o.id === selectedOpeningId) ?? null,
    selectedFurniture: state.furniture.find((f) => f.id === selectedFurnitureId) ?? null,
    /** Alle ausgewählten Möbel (Mehrfachauswahl); `selectedFurnitureId` ist das primäre. */
    selectedFurnitureIds,
    selectedFixtureId,
    selectedFixture: state.fixtures.find((f) => f.id === selectedFixtureId) ?? null,
    actions,
    history: describeHistory(history, historyActions),
  };
}

/** Zustand für Buttons und Tooltips; eine laufende Feldbearbeitung zählt bereits als Schritt. */
function describeHistory(
  history: ReturnType<typeof historyReducer>,
  actions: {
    undo: () => void;
    redo: () => void;
    begin: (id: string, kind: TransactionKind) => void;
    end: (id: string) => void;
    reset: (document: PlanDocument) => void;
  },
) {
  const { transaction, past, future, present } = history;
  const gesture = transaction?.kind === 'gesture';
  const pendingEdit = transaction?.kind === 'edit' && !sameDocument(transaction.before, documentOf(present));
  return {
    ...actions,
    canUndo: !gesture && (past.length > 0 || pendingEdit),
    canRedo: !gesture && !pendingEdit && future.length > 0,
    undoLabel: pendingEdit ? (transaction?.label ?? null) : (past.at(-1)?.label ?? null),
    redoLabel: future[0]?.label ?? null,
  };
}

export type PlannerHistory = ReturnType<typeof usePlanner>['history'];
