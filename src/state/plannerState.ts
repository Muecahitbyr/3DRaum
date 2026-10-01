import {
  DEFAULT_DESIGN,
  DEFAULT_WALL_COLOR,
  isHexColor,
  LIGHTING_BRIGHTNESS,
  normalizeHexColor,
  WALL_FINISHES,
  wallColorOf,
  wallFinishOf,
} from '../config/design';
import { DEFAULT_ROOM_DIMENSIONS, ROOM_DIMENSION_CONSTRAINTS } from '../config/room';
import type { FloorMaterialId, HexColor, LightingSettings, RoomDesign, WallFinish } from '../types/design';
import type { FixturePatch, FixtureType, RoomFixture } from '../types/fixture';
import type { FurnitureGroup, FurnitureItem, FurniturePatch, FurnitureType } from '../types/furniture';
import type { Opening, OpeningPatch, OpeningType } from '../types/opening';
import type { FloorPoint, Meters, RoomDimensionKey, RoomPlan, RoomShape } from '../types/room';
import { sameValues } from '../utils/equality';
import { createFixture, normalizeFixture } from '../utils/fixtures';
import { createFurniture, normalizeFurniture } from '../utils/furniture';
import { findFreePlacement } from '../utils/furniturePlacement';
import { formationCenter, rotateFormation, type FurnitureTransform } from '../utils/furnitureRotation';
import { alignmentDelta, clampFormationDelta, moveFormation, nextCopyName, type AlignMode } from '../utils/furnitureFormation';
import { createOpening, normalizeOpening } from '../utils/openings';
import { roomModelOf, type RoomModel } from '../utils/room/model';
import {
  clampLShape,
  createRectangleRoom,
  createRoomForShape,
  lShapeDimensionsOf,
  moveCorner,
  normalizeRoomPlan,
  removeCorner,
  removeWall,
  resizeLShape,
  resizeRectangle,
  setRoomHeight,
  setWallLength,
  setWallThickness,
  splitWall,
  type LShapeDimensions,
  type RoomEdit,
} from '../utils/room/plan';
import { remapWallItem } from '../utils/room/remap';
import { clamp, roundToPrecision } from '../utils/units';

/**
 * Aktuelle Auswahl. Bei Möbeln sind mehrere möglich: `ids` enthält alle ausgewählten,
 * `id` ist das primäre (zuletzt angeklickte) – Eigenschaften und Abstände beziehen sich darauf.
 */
export type Selection =
  | { kind: 'opening'; id: string }
  | { kind: 'fixture'; id: string }
  | { kind: 'furniture'; id: string; ids: string[] }
  /** Grundriss-Editor: Wand bzw. Ecke am Anfang der Wand `id`. */
  | { kind: 'wall'; id: string }
  | { kind: 'corner'; id: string };

/** Zentraler Planungszustand. Alle Werte sind gültig: Reducer normalisiert bei jeder Änderung. */
export interface PlannerState {
  /** Raumgeometrie: geschlossener Umriss aus Wandsegmenten. */
  room: RoomPlan;
  openings: Opening[];
  furniture: FurnitureItem[];
  /** Feste, wandgebundene Raumobjekte (Heizkörper, Steckdosen, Schalter). */
  fixtures: RoomFixture[];
  /** Möbelgruppen (die Möbel selbst bleiben normale Möbel). */
  groups: FurnitureGroup[];
  /** Bodenbelag und Wandfarben. */
  design: RoomDesign;
  selection: Selection | null;
  /** Fortlaufende Zähler für eindeutige IDs. */
  nextOpeningNumber: number;
  nextFurnitureNumber: number;
  nextFixtureNumber: number;
  nextGroupNumber: number;
  /** Rückmeldung einer abgelehnten Grundriss-Änderung (kein Teil des Plans). */
  roomFeedback: { message: string; id: number } | null;
  /** Erhöht sich, wenn ein neuer Raum angelegt wird (Kamera neu einpassen). */
  layoutToken: number;
}

/**
 * Auswahl per Klick: `replace` ersetzt, `toggle` (Shift) ergänzt/entfernt,
 * `focus` behält eine bestehende Mehrfachauswahl und macht das Möbel nur zum primären
 * (sonst wie `replace`, d. h. inklusive Gruppe).
 */
export type FurniturePickMode = 'replace' | 'toggle' | 'focus';

/** Kopierte Möbel (Zwischenablage) inklusive ihrer Gruppierung. */
export interface FurnitureClipboard {
  items: FurnitureItem[];
  /** Gruppen als Listen von IDs aus `items`. */
  groups: string[][];
}

export type PlannerAction =
  | { type: 'setRoomDimension'; key: RoomDimensionKey; value: Meters }
  | { type: 'setRoomShape'; shape: RoomShape }
  /** Hauptmaße einer (unveränderten) L-Form. */
  | { type: 'setLShapeDimensions'; dimensions: Partial<LShapeDimensions> }
  | { type: 'moveCorner'; wallId: string; point: FloorPoint }
  | { type: 'setWallLength'; wallId: string; length: Meters }
  | { type: 'setWallThickness'; wallId: string; thickness: Meters }
  | { type: 'splitWall'; wallId: string }
  | { type: 'removeCorner'; wallId: string }
  | { type: 'removeWall'; wallId: string }
  | { type: 'addOpening'; openingType: OpeningType }
  | { type: 'updateOpening'; id: string; patch: OpeningPatch }
  | { type: 'removeOpening'; id: string }
  | { type: 'addFurniture'; furnitureType: FurnitureType }
  | { type: 'updateFurniture'; id: string; patch: FurniturePatch }
  | { type: 'removeFurniture'; id: string }
  | { type: 'removeFurnitureMany'; ids: string[] }
  | { type: 'duplicateFurniture'; ids: string[] }
  | { type: 'pasteFurniture'; clipboard: FurnitureClipboard; offset: FloorPoint }
  | { type: 'moveFurniture'; ids: string[]; delta: FloorPoint }
  | { type: 'setFurniturePositions'; positions: Record<string, FloorPoint> }
  /** Position und Drehung mehrerer Möbel (gemeinsames Drehen, bereits im Raum begrenzt). */
  | { type: 'setFurnitureTransforms'; transforms: Record<string, FurnitureTransform> }
  /** Auswahl/Gruppe um ihre Mitte drehen (Schaltflächen); nicht möglich → keine Änderung. */
  | { type: 'rotateFurnitureMany'; ids: string[]; deltaDeg: number }
  | { type: 'alignFurniture'; ids: string[]; mode: AlignMode }
  | { type: 'groupFurniture'; ids: string[] }
  | { type: 'ungroupFurniture'; groupId: string }
  | { type: 'renameGroup'; groupId: string; name: string }
  | { type: 'selectFurniture'; id: string; mode: FurniturePickMode; expandGroup: boolean }
  | { type: 'selectFurnitureMany'; ids: string[] }
  | { type: 'addFixture'; fixtureType: FixtureType }
  | { type: 'updateFixture'; id: string; patch: FixturePatch }
  | { type: 'removeFixture'; id: string }
  | { type: 'setFloorMaterial'; floor: FloorMaterialId }
  | { type: 'setWallColor'; side: string; color: HexColor }
  | { type: 'setAllWallColors'; color: HexColor }
  | { type: 'setWallFinish'; wallId: string; finish: WallFinish }
  | { type: 'setAllWallFinishes'; finish: WallFinish }
  | { type: 'setCeilingColor'; color: HexColor }
  | { type: 'setLighting'; patch: Partial<LightingSettings> }
  | { type: 'select'; selection: Selection | null };

export const initialPlannerState: PlannerState = {
  room: createRectangleRoom(DEFAULT_ROOM_DIMENSIONS),
  openings: [],
  furniture: [],
  fixtures: [],
  groups: [],
  design: DEFAULT_DESIGN,
  selection: null,
  nextOpeningNumber: 1,
  nextFurnitureNumber: 1,
  nextFixtureNumber: 1,
  nextGroupNumber: 1,
  roomFeedback: null,
  layoutToken: 0,
};

/** Versatz für Kopien (Duplizieren/Einfügen). */
export const COPY_OFFSET: FloorPoint = { x: 0.2, z: 0.2 };

const model = (state: PlannerState): RoomModel => roomModelOf(state.room);

const isSelected = (selection: Selection | null, kind: Selection['kind'], id: string) =>
  selection?.kind === kind && selection.id === id;

/** Aktuell ausgewählte Möbel-IDs (leer, wenn keine Möbel ausgewählt sind). */
export const selectedFurnitureIds = (selection: Selection | null): string[] => (selection?.kind === 'furniture' ? selection.ids : []);

/** IDs einschließlich aller Mitglieder ihrer Gruppen, in Möbel-Reihenfolge. */
function withGroups(state: PlannerState, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  for (const group of state.groups) if (group.memberIds.some((id) => wanted.has(id))) group.memberIds.forEach((id) => wanted.add(id));
  return state.furniture.filter((f) => wanted.has(f.id)).map((f) => f.id);
}

function furnitureSelection(ids: string[], primary: string): Selection | null {
  if (ids.length === 0) return null;
  return { kind: 'furniture', id: ids.includes(primary) ? primary : ids[ids.length - 1], ids };
}

/** Gruppen bereinigen: nur existierende Mitglieder, mindestens zwei. */
function cleanGroups(groups: FurnitureGroup[], furniture: FurnitureItem[]): FurnitureGroup[] {
  const existing = new Set(furniture.map((f) => f.id));
  const next = groups
    .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => existing.has(id)) }))
    .filter((g) => g.memberIds.length >= 2);
  const unchanged = next.length === groups.length && next.every((g, i) => g.memberIds.length === groups[i].memberIds.length);
  return unchanged ? groups : next;
}

function removeFurniture(state: PlannerState, ids: readonly string[]): PlannerState {
  const remove = new Set(ids);
  const furniture = state.furniture.filter((f) => !remove.has(f.id));
  if (furniture.length === state.furniture.length) return state;
  const selection =
    state.selection?.kind === 'furniture'
      ? furnitureSelection(state.selection.ids.filter((id) => !remove.has(id)), state.selection.id)
      : state.selection;
  return { ...state, furniture, groups: cleanGroups(state.groups, furniture), selection };
}

/** Höchstlänge eines Gruppennamens (z. B. „Essgruppe“, „Arbeitsplatz“). */
export const GROUP_NAME_MAX_LENGTH = 40;

/** Position und Drehung mehrerer Möbel setzen (gemeinsames Drehen) und normalisieren. */
function applyTransforms(state: PlannerState, transforms: Record<string, FurnitureTransform>): PlannerState {
  let changed = false;
  const furniture = state.furniture.map((f) => {
    const t = transforms[f.id];
    if (!t || (t.position.x === f.position.x && t.position.z === f.position.z && t.rotationDeg === f.rotationDeg)) return f;
    changed = true;
    return normalizeFurniture({ ...f, position: t.position, rotationDeg: t.rotationDeg }, model(state));
  });
  return changed ? { ...state, furniture } : state;
}

/** Positionen setzen (bereits im Raum begrenzt) und normalisieren. */
function applyPositions(state: PlannerState, positions: Record<string, FloorPoint>): PlannerState {
  let changed = false;
  const furniture = state.furniture.map((f) => {
    const position = positions[f.id];
    if (!position || (position.x === f.position.x && position.z === f.position.z)) return f;
    changed = true;
    return normalizeFurniture({ ...f, position }, model(state));
  });
  return changed ? { ...state, furniture } : state;
}

/**
 * Kopien einfügen (Duplizieren/Einfügen): neue IDs, fortlaufende Namen, gemeinsam
 * versetzt (im Raum begrenzt), Gruppen werden mitkopiert. Die Kopien werden ausgewählt.
 */
function insertCopies(state: PlannerState, sources: readonly FurnitureItem[], sourceGroups: readonly string[][], offset: FloorPoint): PlannerState {
  if (sources.length === 0) return state;
  const delta = clampFormationDelta(sources, offset, model(state));
  let number = state.nextFurnitureNumber;
  const names = state.furniture.map((f) => f.name);
  const idMap = new Map<string, string>();
  const copies = sources.map((source) => {
    const id = `furniture-${number++}`;
    idMap.set(source.id, id);
    const name = nextCopyName(source.name, names);
    names.push(name);
    return normalizeFurniture(
      { ...source, id, name, position: { x: source.position.x + delta.x, z: source.position.z + delta.z } },
      model(state),
    );
  });
  let groupNumber = state.nextGroupNumber;
  const groups = sourceGroups
    .map((members) => members.map((id) => idMap.get(id)).filter((id): id is string => !!id))
    .filter((members) => members.length >= 2)
    .map((memberIds) => ({ id: `group-${groupNumber}`, name: `Gruppe ${groupNumber++}`, memberIds }));
  const ids = copies.map((c) => c.id);
  return {
    ...state,
    furniture: [...state.furniture, ...copies],
    groups: [...state.groups, ...groups],
    selection: furnitureSelection(ids, ids[0]),
    nextFurnitureNumber: number,
    nextGroupNumber: groupNumber,
  };
}

/** Gruppen, die vollständig in `ids` enthalten sind (für Duplizieren/Kopieren). */
export function groupsWithin(groups: readonly FurnitureGroup[], ids: readonly string[]): string[][] {
  const set = new Set(ids);
  return groups.filter((g) => g.memberIds.every((id) => set.has(id))).map((g) => [...g.memberIds]);
}

/**
 * Ersetzt ein Element per ID. Ändert sich nach der Normalisierung kein Wert,
 * bleibt das Original-Array erhalten – so entstehen keine leeren Verlaufsschritte.
 */
function updateById<T extends { id: string }>(items: T[], id: string, update: (item: T) => T): T[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    const updated = update(item);
    if (sameValues(item, updated)) return item;
    changed = true;
    return updated;
  });
  return changed ? next : items;
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'setRoomDimension': {
      const { min, max } = ROOM_DIMENSION_CONSTRAINTS[action.key];
      const value = roundToPrecision(clamp(action.value, min, max));
      const current = model(state);
      if (current.dimensions[action.key] === value) return state;
      if (action.key === 'height') return applyRoom(state, { ok: true, plan: setRoomHeight(state.room, value) });
      // Breite/Länge nur beim Rechteck (sonst werden Wände einzeln bearbeitet).
      if (!current.isRectangle) return state;
      const next = applyRoom(state, resizeRectangle(state.room, { ...current.dimensions, [action.key]: value }));
      return next === state ? state : { ...next, room: { ...next.room, shape: 'rectangle' } };
    }

    case 'setRoomShape': {
      const current = model(state);
      const plan = createRoomForShape(action.shape, state.room.height, current.dimensions);
      const next = applyRoom(state, { ok: true, plan }, { nearestFor: new Set(state.room.walls.map((w) => w.id)) });
      // Farben: einheitliche Wandfarbe wird übernommen, sonst Standardfarbe.
      const colors = new Set(state.room.walls.map((w) => wallColorOf(state.design, w.id)));
      const shared = colors.size === 1 ? [...colors][0] : DEFAULT_WALL_COLOR;
      const finishes = new Set(state.room.walls.map((w) => wallFinishOf(state.design, w.id)));
      const sharedFinish = finishes.size === 1 ? [...finishes][0] : 'matte';
      return {
        ...next,
        design: {
          ...next.design,
          wallColors: Object.fromEntries(next.room.walls.map((w) => [w.id, shared])),
          wallFinishes: sharedFinish === 'matte' ? {} : Object.fromEntries(next.room.walls.map((w) => [w.id, sharedFinish])),
        },
        selection: null,
        layoutToken: state.layoutToken + 1,
      };
    }

    case 'setLShapeDimensions': {
      const current = lShapeDimensionsOf(state.room);
      if (!current) return state;
      const next = clampLShape({ ...current, ...action.dimensions }, ROOM_DIMENSION_CONSTRAINTS.width);
      if (sameValues(next, current)) return state;
      return applyRoom(state, resizeLShape(state.room, next));
    }

    case 'moveCorner':
      return applyRoom(state, moveCorner(state.room, action.wallId, action.point));

    case 'setWallLength':
      return applyRoom(state, setWallLength(state.room, action.wallId, action.length));

    case 'setWallThickness':
      return applyRoom(state, setWallThickness(state.room, action.wallId, action.thickness));

    case 'splitWall': {
      const result = splitWall(state.room, action.wallId);
      const next = applyRoom(state, result, { nearestFor: new Set([action.wallId]) });
      if (!result.ok || !result.newWallId || next === state) return next;
      return {
        ...next,
        design: {
          ...next.design,
          wallColors: { ...next.design.wallColors, [result.newWallId]: wallColorOf(state.design, action.wallId) },
          wallFinishes: { ...next.design.wallFinishes, [result.newWallId]: wallFinishOf(state.design, action.wallId) },
        },
        selection: { kind: 'corner', id: result.newWallId },
      };
    }

    case 'removeCorner':
      return applyRoom(state, removeCorner(state.room, action.wallId), { nearestFor: new Set([action.wallId]) });

    case 'removeWall':
      return applyRoom(state, removeWall(state.room, action.wallId), { nearestFor: new Set([action.wallId]) });

    case 'addOpening': {
      const id = `opening-${state.nextOpeningNumber}`;
      const opening = createOpening(action.openingType, id, state.openings, model(state));
      return {
        ...state,
        openings: [...state.openings, opening],
        selection: { kind: 'opening', id },
        nextOpeningNumber: state.nextOpeningNumber + 1,
      };
    }

    case 'updateOpening': {
      const openings = updateById(state.openings, action.id, (o) =>
        normalizeOpening({ ...o, ...action.patch } as Opening, model(state)),
      );
      return openings === state.openings ? state : { ...state, openings };
    }

    case 'removeOpening':
      return {
        ...state,
        openings: state.openings.filter((o) => o.id !== action.id),
        selection: isSelected(state.selection, 'opening', action.id) ? null : state.selection,
      };

    case 'addFurniture': {
      const id = `furniture-${state.nextFurnitureNumber}`;
      const created = createFurniture(action.furnitureType, id, state.furniture, model(state));
      // Freier Platz (Wandmöbel an der Wand, sonst nahe der Raummitte) statt alle exakt in der Mitte.
      const placement = findFreePlacement(created, { room: model(state), furniture: state.furniture, openings: state.openings, fixtures: state.fixtures });
      const unchanged = placement.position.x === created.position.x && placement.position.z === created.position.z && placement.rotationDeg === created.rotationDeg;
      const item = unchanged ? created : normalizeFurniture({ ...created, ...placement }, model(state));
      return {
        ...state,
        furniture: [...state.furniture, item],
        selection: { kind: 'furniture', id, ids: [id] },
        nextFurnitureNumber: state.nextFurnitureNumber + 1,
      };
    }

    case 'updateFurniture': {
      const furniture = updateById(state.furniture, action.id, (f) =>
        normalizeFurniture(
          { ...f, ...action.patch, position: { ...f.position, ...action.patch.position } },
          model(state),
        ),
      );
      return furniture === state.furniture ? state : { ...state, furniture };
    }

    case 'removeFurniture':
      return removeFurniture(state, [action.id]);

    case 'removeFurnitureMany':
      return removeFurniture(state, action.ids);

    case 'duplicateFurniture': {
      const sources = state.furniture.filter((f) => action.ids.includes(f.id));
      return insertCopies(state, sources, groupsWithin(state.groups, action.ids), COPY_OFFSET);
    }

    case 'pasteFurniture':
      return insertCopies(state, action.clipboard.items, action.clipboard.groups, action.offset);

    case 'moveFurniture': {
      const items = state.furniture.filter((f) => action.ids.includes(f.id));
      return applyPositions(state, moveFormation(items, action.delta, model(state)));
    }

    case 'setFurniturePositions':
      return applyPositions(state, action.positions);

    case 'setFurnitureTransforms':
      return applyTransforms(state, action.transforms);

    case 'rotateFurnitureMany': {
      const items = state.furniture.filter((f) => action.ids.includes(f.id));
      if (items.length === 0) return state;
      const transforms = rotateFormation(items, formationCenter(items), action.deltaDeg, model(state));
      return transforms ? applyTransforms(state, transforms) : state;
    }

    case 'alignFurniture': {
      const items = state.furniture.filter((f) => action.ids.includes(f.id));
      if (items.length === 0) return state;
      return applyPositions(state, moveFormation(items, alignmentDelta(items, action.mode, model(state)), model(state)));
    }

    case 'groupFurniture': {
      const ids = state.furniture.filter((f) => action.ids.includes(f.id)).map((f) => f.id);
      if (ids.length < 2) return state;
      const others = cleanGroups(
        state.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !ids.includes(id)) })),
        state.furniture,
      );
      const group = { id: `group-${state.nextGroupNumber}`, name: `Gruppe ${state.nextGroupNumber}`, memberIds: ids };
      return { ...state, groups: [...others, group], nextGroupNumber: state.nextGroupNumber + 1 };
    }

    case 'renameGroup': {
      // Wie Möbelnamen: beim Tippen nur vorne kürzen; leer → Standardname.
      const groups = updateById(state.groups, action.groupId, (g) => ({
        ...g,
        name: action.name.trim() ? action.name.trimStart().slice(0, GROUP_NAME_MAX_LENGTH) : `Gruppe ${g.id.replace(/^group-/, '')}`,
      }));
      return groups === state.groups ? state : { ...state, groups };
    }

    case 'ungroupFurniture': {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      return groups.length === state.groups.length ? state : { ...state, groups };
    }

    case 'selectFurniture': {
      if (!state.furniture.some((f) => f.id === action.id)) return state;
      const base = action.expandGroup ? withGroups(state, [action.id]) : [action.id];
      const current = selectedFurnitureIds(state.selection);
      let ids = base;
      if (action.mode === 'focus' && current.includes(action.id) && current.length > 1) {
        ids = current;
      } else if (action.mode === 'toggle') {
        const allSelected = base.every((id) => current.includes(id));
        ids = allSelected ? current.filter((id) => !base.includes(id)) : [...current, ...base.filter((id) => !current.includes(id))];
      }
      const selection = furnitureSelection(ids, action.id);
      return sameSelection(state.selection, selection) ? state : { ...state, selection };
    }

    case 'selectFurnitureMany': {
      const ids = withGroups(state, action.ids);
      const selection = furnitureSelection(ids, ids[0]);
      return sameSelection(state.selection, selection) ? state : { ...state, selection };
    }

    case 'addFixture': {
      const id = `fixture-${state.nextFixtureNumber}`;
      const fixture = createFixture(action.fixtureType, id, state.fixtures, model(state), state.openings);
      return {
        ...state,
        fixtures: [...state.fixtures, fixture],
        selection: { kind: 'fixture', id },
        nextFixtureNumber: state.nextFixtureNumber + 1,
      };
    }

    case 'updateFixture': {
      const fixtures = updateById(state.fixtures, action.id, (f) => normalizeFixture({ ...f, ...action.patch }, model(state)));
      return fixtures === state.fixtures ? state : { ...state, fixtures };
    }

    case 'removeFixture':
      return {
        ...state,
        fixtures: state.fixtures.filter((f) => f.id !== action.id),
        selection: isSelected(state.selection, 'fixture', action.id) ? null : state.selection,
      };

    case 'setFloorMaterial':
      return state.design.floor === action.floor ? state : { ...state, design: { ...state.design, floor: action.floor } };

    case 'setWallColor': {
      if (!isHexColor(action.color) || !state.room.walls.some((w) => w.id === action.side)) return state;
      const color = normalizeHexColor(action.color);
      if (wallColorOf(state.design, action.side) === color) return state;
      return { ...state, design: { ...state.design, wallColors: { ...state.design.wallColors, [action.side]: color } } };
    }

    case 'setAllWallColors': {
      if (!isHexColor(action.color)) return state;
      const color = normalizeHexColor(action.color);
      if (state.room.walls.every((w) => wallColorOf(state.design, w.id) === color)) return state;
      const wallColors = Object.fromEntries(state.room.walls.map((w) => [w.id, color]));
      return { ...state, design: { ...state.design, wallColors } };
    }

    case 'setWallFinish': {
      if (!Object.hasOwn(WALL_FINISHES, action.finish) || !state.room.walls.some((w) => w.id === action.wallId)) return state;
      if (wallFinishOf(state.design, action.wallId) === action.finish) return state;
      return { ...state, design: { ...state.design, wallFinishes: { ...state.design.wallFinishes, [action.wallId]: action.finish } } };
    }

    case 'setAllWallFinishes': {
      if (!Object.hasOwn(WALL_FINISHES, action.finish)) return state;
      if (state.room.walls.every((w) => wallFinishOf(state.design, w.id) === action.finish)) return state;
      const wallFinishes = Object.fromEntries(state.room.walls.map((w) => [w.id, action.finish]));
      return { ...state, design: { ...state.design, wallFinishes } };
    }

    case 'setCeilingColor': {
      if (!isHexColor(action.color)) return state;
      const color = normalizeHexColor(action.color);
      return color === state.design.ceilingColor ? state : { ...state, design: { ...state.design, ceilingColor: color } };
    }

    case 'setLighting': {
      const lighting = { ...state.design.lighting, ...action.patch };
      lighting.brightness = Math.round(clamp(lighting.brightness, LIGHTING_BRIGHTNESS.min, LIGHTING_BRIGHTNESS.max) * 100) / 100;
      if (lighting.preset === state.design.lighting.preset && lighting.brightness === state.design.lighting.brightness) return state;
      return { ...state, design: { ...state.design, lighting } };
    }

    case 'select':
      return sameSelection(state.selection, action.selection) ? state : { ...state, selection: action.selection };
  }
}

/**
 * Übernimmt einen bearbeiteten Grundriss – oder meldet, warum nicht. Türen/Fenster/
 * Raumobjekte werden neu zugeordnet und begrenzt, Möbel in die neue Kontur geschoben.
 * Die Normalisierung verschiebt das Grundrisssystem ggf.; die Weltlage bleibt gleich.
 */
function applyRoom(state: PlannerState, edit: RoomEdit, options: { nearestFor?: ReadonlySet<string> } = {}): PlannerState {
  if (!edit.ok) {
    return { ...state, roomFeedback: { message: edit.error, id: (state.roomFeedback?.id ?? 0) + 1 } };
  }
  if (sameValues(edit.plan, state.room)) return state;
  const before = roomModelOf(state.room);
  const raw = roomModelOf(edit.plan);
  const { plan, shift } = normalizeRoomPlan(edit.plan);
  const after = roomModelOf(plan);
  const remap = <T extends { wall: string; offset: number; width: number }>(items: T[], normalize: (item: T, room: RoomModel) => T) => {
    let changed = false;
    const next = items.flatMap((item) => {
      const moved = remapWallItem(item, before, raw, options.nearestFor);
      if (!moved) {
        changed = true;
        return [];
      }
      const normalized = normalize(moved, after);
      if (normalized !== item && !sameValues(normalized, item)) changed = true;
      return [sameValues(normalized, item) ? item : normalized];
    });
    return changed ? next : items;
  };
  const shifted = shift.x !== 0 || shift.z !== 0;
  let furnitureChanged = false;
  const furniture = state.furniture.map((f) => {
    const moved = shifted ? { ...f, position: { x: roundToPrecision(f.position.x + shift.x), z: roundToPrecision(f.position.z + shift.z) } } : f;
    const normalized = normalizeFurniture(moved, after);
    if (sameValues(normalized, f)) return f;
    furnitureChanged = true;
    return normalized;
  });
  const wallIds = new Set(plan.walls.map((w) => w.id));
  const selection =
    state.selection && (state.selection.kind === 'wall' || state.selection.kind === 'corner') && !wallIds.has(state.selection.id) ? null : state.selection;
  const colors = Object.entries(state.design.wallColors).filter(([id]) => wallIds.has(id));
  const finishes = Object.entries(state.design.wallFinishes).filter(([id]) => wallIds.has(id));
  const design =
    colors.length === Object.keys(state.design.wallColors).length && finishes.length === Object.keys(state.design.wallFinishes).length
      ? state.design
      : { ...state.design, wallColors: Object.fromEntries(colors), wallFinishes: Object.fromEntries(finishes) };
  return {
    ...state,
    room: plan,
    openings: remap(state.openings, (o, room) => normalizeOpening(o as Opening, room)),
    fixtures: remap(state.fixtures, normalizeFixture),
    furniture: furnitureChanged ? furniture : state.furniture,
    design,
    selection,
  };
}

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.id !== b.id) return false;
  if (a.kind === 'furniture' && b.kind === 'furniture') return a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i]);
  return true;
}
