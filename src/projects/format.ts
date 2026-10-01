import {
  DEFAULT_CEILING_COLOR,
  DEFAULT_DESIGN,
  DEFAULT_WALL_COLOR,
  FLOOR_MATERIALS,
  isHexColor,
  LEGACY_LIGHTING,
  LIGHTING_BRIGHTNESS,
  LIGHTING_PRESETS,
  normalizeHexColor,
  WALL_FINISHES,
} from '../config/design';
import { FIXTURE_CATALOG } from '../config/fixtures';
import { FURNITURE_CATALOG } from '../config/furniture';
import { DEFAULT_ROOM_DIMENSIONS, ROOM_DIMENSION_CONSTRAINTS, ROOM_DIMENSION_KEYS, ROOM_LIMITS, WALL_THICKNESS } from '../config/room';
import type { PlanDocument } from '../state/history';
import type { FloorMaterialId, LightingPreset, LightingSettings, RoomDesign, WallFinish } from '../types/design';
import type { FixtureType, RoomFixture } from '../types/fixture';
import type { FurnitureColorSlot, FurnitureGroup, FurnitureItem, FurnitureType, LampLight } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { FloorPoint, RoomDimensions, RoomPlan, RoomShape, RoomWall } from '../types/room';
import { normalizeFurniture } from '../utils/furniture';
import { normalizeFixture } from '../utils/fixtures';
import { normalizeOpening } from '../utils/openings';
import { boundsOf } from '../utils/polygon';
import { roomModelOf, type RoomModel } from '../utils/room/model';
import { createRectangleRoom, normalizeRoomPlan, validateRoomPlan } from '../utils/room/plan';
import { clamp, roundToPrecision } from '../utils/units';

export const PROJECT_FORMAT = 'raumplaner-project';
/**
 * Aktuelle Formatversion. Bei Änderungen erhöhen und eine Migration ergänzen.
 * - 1: Raummaße, Türen/Fenster, Möbel
 * - 2: zusätzlich Gestaltung (`plan.design`: Bodenbelag, Wandfarben)
 * - 3: Türanschlag/Öffnungsrichtung, Fensterflügel, Raumobjekte (`plan.fixtures`), Möbelgruppen (`plan.groups`)
 * - 4: Raum als geschlossener Wandumriss (`plan.room.walls` mit ID, Anfang, Ende, Höhe, Stärke);
 *      Türen/Fenster/Raumobjekte gehören zu einer Wand-ID (Position ab Wandanfang),
 *      Wandfarben je Wand-ID. Ersetzt `plan.dimensions`.
 * - 5: Gestaltung erweitert (Wandoberflächen, Deckenfarbe, Lichtstimmung + Helligkeit,
 *      neue Bodenbeläge); Möbel mit Farben (`colors`), Lampen mit Licht (`light`),
 *      Tischlampen mit Standhöhe (`elevation`).
 * - 6: neue Öffnungsart „Durchgang“ (`type: 'passage'`: Wand, Position, Breite, Höhe).
 *      Bestehende Daten bleiben unverändert.
 */
export const PROJECT_FORMAT_VERSION = 6;

/**
 * Gespeichertes Projekt. Enthält nur den Plan – keine Auswahl,
 * Kamera, Ansicht oder sonstigen UI-Zustände.
 */
export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  id: string;
  name: string;
  /** ISO-8601-Zeitstempel. */
  createdAt: string;
  updatedAt: string;
  plan: PlanDocument;
}

export type ParsedProject =
  | { ok: true; project: ProjectFile; warnings: string[] }
  | { ok: false; error: string; id?: string; name?: string };

export const DEFAULT_PROJECT_NAME = 'Unbenanntes Projekt';
export const PROJECT_NAME_MAX_LENGTH = 60;

export const DEFAULT_PLAN: PlanDocument = {
  room: createRectangleRoom(DEFAULT_ROOM_DIMENSIONS),
  openings: [],
  furniture: [],
  fixtures: [],
  groups: [],
  design: DEFAULT_DESIGN,
};

/** Migrationen: Schlüssel = Ausgangsversion, Ergebnis = Daten der nächsten Version. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: Gestaltung ergänzen (bisheriger Raum → Standardgestaltung).
  1: (data) => ({
    ...data,
    version: 2,
    plan: isObject(data.plan) ? { ...data.plan, design: DEFAULT_DESIGN } : data.plan,
  }),
  // 2 → 3: Türen behalten ihr bisheriges Verhalten (Band am Planungsanfang, öffnet nach innen),
  // Fenster sind einflügelig; Raumobjekte und Gruppen gibt es noch keine.
  2: (data) => {
    if (!isObject(data.plan)) return { ...data, version: 3 };
    const openings = Array.isArray(data.plan.openings)
      ? data.plan.openings.map((o: unknown) => {
          if (!isObject(o)) return o;
          // Band lag am Grundriss-Anfang (links/oben): vom Raum aus an Nord/Ost links, an Süd/West rechts.
          if (o.type === 'door') return { ...o, hinge: o.wall === 'north' || o.wall === 'east' ? 'left' : 'right', swing: 'inward' };
          if (o.type === 'window') return { ...o, sashes: 1 };
          return o;
        })
      : data.plan.openings;
    return { ...data, version: 3, plan: { ...data.plan, openings, fixtures: [], groups: [] } };
  },
  // 3 → 4: Rechteckraum → vier Wandsegmente (IDs north/east/south/west, bisherige Wandstärke).
  // Positionen an Süd-/Westwand wurden „von links/oben“ gemessen, jetzt ab Wandanfang
  // (Wände laufen von innen gesehen von links nach rechts) → umrechnen. Farben behalten
  // ihre Schlüssel, Möbelpositionen bleiben unverändert. Der Plan sieht danach identisch aus.
  3: (data) => {
    if (!isObject(data.plan)) return { ...data, version: 4 };
    const { dimensions: rawDimensions, ...rest } = data.plan;
    const dimensions = readDimensions(rawDimensions);
    if (!dimensions) return { ...data, version: 4, plan: { ...rest, room: null } };
    const room = createRectangleRoom(dimensions);
    const reversed: Record<string, number> = { south: dimensions.width, west: dimensions.length };
    const convert = (list: unknown) =>
      Array.isArray(list)
        ? list.map((item: unknown) => {
            if (!isObject(item) || typeof item.wall !== 'string' || !(item.wall in reversed) || !finite(item.offset) || !finite(item.width)) return item;
            return { ...item, offset: reversed[item.wall] - item.offset - item.width };
          })
        : list;
    return {
      ...data,
      version: 4,
      plan: {
        ...rest,
        room: { shape: 'rectangle', height: dimensions.height, walls: room.walls },
        openings: convert(rest.openings),
        fixtures: convert(rest.fixtures),
      },
    };
  },
  // 4 → 5: bisherige Gestaltung bleibt; Decke weiß, Wände matt und die Lichtstimmung
  // „Neutral“ – sie entspricht exakt der früheren festen Beleuchtung (unveränderter Look).
  4: (data) => {
    if (!isObject(data.plan)) return { ...data, version: 5 };
    const design = isObject(data.plan.design) ? data.plan.design : {};
    return {
      ...data,
      version: 5,
      plan: { ...data.plan, design: { ...design, wallFinishes: {}, ceilingColor: DEFAULT_CEILING_COLOR, lighting: LEGACY_LIGHTING } },
    };
  },
  // 5 → 6: nur neue Öffnungsart (Durchgang) – Türen, Fenster und Geometrie bleiben exakt gleich.
  5: (data) => ({ ...data, version: 6 }),
};

export function cleanProjectName(name: unknown): string {
  const text = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, PROJECT_NAME_MAX_LENGTH) : '';
  return text || DEFAULT_PROJECT_NAME;
}

/**
 * Speicherform: Der Raum ohne `origin` – die Weltlage ist Ansichtssache und wird beim
 * Öffnen neu bestimmt (Raum zentriert).
 */
export function serializeProject(project: ProjectFile): string {
  const { origin: _origin, ...room } = project.plan.room;
  return JSON.stringify({ ...project, plan: { ...project.plan, room } });
}

// ---------- defensive Leser ----------

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isoOr = (v: unknown, fallback: string) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;

function readDimensions(value: unknown): RoomDimensions | null {
  if (!isObject(value)) return null;
  const result = { ...DEFAULT_ROOM_DIMENSIONS };
  for (const key of ROOM_DIMENSION_KEYS) {
    const v = value[key];
    if (!finite(v)) return null;
    const { min, max } = ROOM_DIMENSION_CONSTRAINTS[key];
    result[key] = roundToPrecision(clamp(v, min, max));
  }
  return result;
}

/** Gestaltung lesen (Farben je Wand-ID); ungültige Teile werden durch Standardwerte ersetzt und gezählt. */
function readDesign(value: unknown, room: RoomPlan): { design: RoomDesign; invalid: number } {
  const defaults = Object.fromEntries(room.walls.map((w) => [w.id, DEFAULT_WALL_COLOR]));
  if (!isObject(value)) {
    return { design: { ...DEFAULT_DESIGN, floor: DEFAULT_DESIGN.floor, wallColors: defaults, wallFinishes: {} }, invalid: 1 };
  }
  let invalid = 0;
  const floor = typeof value.floor === 'string' && Object.hasOwn(FLOOR_MATERIALS, value.floor) ? (value.floor as FloorMaterialId) : null;
  if (!floor) invalid++;
  const colors = isObject(value.wallColors) ? value.wallColors : {};
  const wallColors = { ...defaults };
  for (const wall of room.walls) {
    const color = colors[wall.id];
    if (isHexColor(color)) wallColors[wall.id] = normalizeHexColor(color);
    else invalid++;
  }
  // Wandoberflächen: nur bekannte Wände und Oberflächen (fehlend = matt).
  const finishes = isObject(value.wallFinishes) ? value.wallFinishes : {};
  const wallFinishes: Record<string, WallFinish> = {};
  for (const wall of room.walls) {
    const finish = finishes[wall.id];
    if (finish === undefined) continue;
    if (typeof finish === 'string' && Object.hasOwn(WALL_FINISHES, finish)) wallFinishes[wall.id] = finish as WallFinish;
    else invalid++;
  }
  const ceilingColor = isHexColor(value.ceilingColor) ? normalizeHexColor(value.ceilingColor) : DEFAULT_CEILING_COLOR;
  if (!isHexColor(value.ceilingColor)) invalid++;
  const lighting = readLighting(value.lighting);
  if (!lighting) invalid++;
  return {
    design: { floor: floor ?? DEFAULT_DESIGN.floor, wallColors, wallFinishes, ceilingColor, lighting: lighting ?? LEGACY_LIGHTING },
    invalid,
  };
}

function readLighting(value: unknown): LightingSettings | null {
  if (!isObject(value) || typeof value.preset !== 'string' || !Object.hasOwn(LIGHTING_PRESETS, value.preset) || !finite(value.brightness)) return null;
  const brightness = Math.round(clamp(value.brightness, LIGHTING_BRIGHTNESS.min, LIGHTING_BRIGHTNESS.max) * 100) / 100;
  return { preset: value.preset as LightingPreset, brightness };
}

const COLOR_SLOTS: readonly FurnitureColorSlot[] = ['main', 'wood', 'fabric'];

/** Möbelfarben: nur gültige Hex-Farben bekannter Bereiche (Rest verwirft die Normalisierung). */
function readColors(value: unknown): Partial<Record<FurnitureColorSlot, string>> | undefined {
  if (!isObject(value)) return undefined;
  const colors: Partial<Record<FurnitureColorSlot, string>> = {};
  for (const slot of COLOR_SLOTS) if (isHexColor(value[slot])) colors[slot] = normalizeHexColor(value[slot] as string);
  return Object.keys(colors).length ? colors : undefined;
}

function readLight(value: unknown): LampLight | undefined {
  if (!isObject(value)) return undefined;
  return {
    on: value.on !== false,
    intensity: finite(value.intensity) ? value.intensity : 1,
    temperature: finite(value.temperature) ? value.temperature : 2700,
  };
}

const readPoint = (value: unknown): FloorPoint | null =>
  isObject(value) && finite(value.x) && finite(value.z) ? { x: value.x, z: value.z } : null;
const ROOM_SHAPES: readonly RoomShape[] = ['rectangle', 'l-shape', 'free'];

/**
 * Raumgeometrie lesen und prüfen (geschlossen, keine Selbstüberschneidung, gültige Zahlen).
 * Ein ungültiger Grundriss macht das Projekt unlesbar – er ließe sich nicht darstellen.
 */
function readRoom(value: unknown): { ok: true; room: RoomPlan; shift: FloorPoint } | { ok: false; error: string } {
  if (!isObject(value) || !Array.isArray(value.walls) || !finite(value.height)) return { ok: false, error: 'Die Raummaße sind ungültig.' };
  const { min, max } = ROOM_DIMENSION_CONSTRAINTS.height;
  const height = roundToPrecision(clamp(value.height, min, max));
  const walls: RoomWall[] = [];
  for (const raw of value.walls) {
    if (!isObject(raw) || !nonEmptyString(raw.id)) return { ok: false, error: 'Die Raummaße sind ungültig.' };
    const start = readPoint(raw.start);
    const end = readPoint(raw.end);
    if (!start || !end) return { ok: false, error: 'Die Raummaße sind ungültig.' };
    const thickness = finite(raw.thickness) ? clamp(raw.thickness, ROOM_LIMITS.thickness.min, ROOM_LIMITS.thickness.max) : WALL_THICKNESS;
    walls.push({ id: raw.id, start, end, height, thickness: roundToPrecision(thickness) });
  }
  const shape = ROOM_SHAPES.includes(value.shape as RoomShape) ? (value.shape as RoomShape) : 'free';
  const b = boundsOf(walls.map((w) => w.start));
  const plan: RoomPlan = { shape, walls, height, origin: { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 } };
  const error = validateRoomPlan(plan);
  if (error) return { ok: false, error: `Der Grundriss ist ungültig: ${error}` };
  const normalized = normalizeRoomPlan(plan);
  // Nach dem Verschieben liegt der Raum wieder zentriert im Weltursprung.
  const room = { ...normalized.plan, origin: { x: (b.maxX - b.minX) / 2, z: (b.maxZ - b.minZ) / 2 } };
  return { ok: true, room, shift: normalized.shift };
}

/** Zählt ungültige Detailwerte (Anschlag, Flügel), die durch Standardwerte ersetzt wurden. */
const openingDefaults = { invalid: 0 };

function readOpening(value: unknown, room: RoomModel): Opening | null {
  if (!isObject(value) || !nonEmptyString(value.id)) return null;
  const { type, wall } = value;
  if (type !== 'door' && type !== 'window' && type !== 'passage') return null;
  const segment = typeof wall === 'string' ? room.wallById.get(wall) : undefined;
  if (!segment) return null;
  if (!finite(value.offset) || !finite(value.width) || !finite(value.height)) return null;
  const base = { id: value.id, wall: segment.id, offset: value.offset, width: value.width, height: value.height };
  if (type === 'passage') return normalizeOpening({ ...base, type }, room);
  if (type === 'door') {
    const hinge = value.hinge === 'left' || value.hinge === 'right' ? value.hinge : null;
    const swing = value.swing === 'inward' || value.swing === 'outward' ? value.swing : null;
    if (!hinge || !swing) openingDefaults.invalid++;
    return normalizeOpening({ ...base, type, hinge: hinge ?? (segment.readingReversed ? 'right' : 'left'), swing: swing ?? 'inward' }, room);
  }
  if (!finite(value.sillHeight)) return null;
  const sashes = value.sashes === 1 || value.sashes === 2 ? value.sashes : null;
  if (!sashes) openingDefaults.invalid++;
  return normalizeOpening({ ...base, type, sillHeight: value.sillHeight, sashes: sashes ?? 1 }, room);
}

function readFixture(value: unknown, room: RoomModel): RoomFixture | null {
  if (!isObject(value) || !nonEmptyString(value.id)) return null;
  const type = value.type as FixtureType;
  if (typeof type !== 'string' || !Object.hasOwn(FIXTURE_CATALOG, type)) return null;
  if (typeof value.wall !== 'string' || !room.wallById.has(value.wall) || !finite(value.offset) || !finite(value.elevation)) return null;
  const { defaults } = FIXTURE_CATALOG[type];
  const size = (v: unknown, fallback: number) => (finite(v) ? v : fallback);
  return normalizeFixture(
    {
      id: value.id,
      type,
      wall: value.wall as string,
      offset: value.offset,
      width: size(value.width, defaults.width),
      height: size(value.height, defaults.height),
      depth: size(value.depth, defaults.depth),
      elevation: value.elevation,
    },
    room,
  );
}

/** Gruppen: nur vorhandene Möbel, jedes Möbel höchstens in einer Gruppe, mindestens zwei Mitglieder. */
function readGroup(value: unknown, furnitureIds: Set<string>, used: Set<string>): FurnitureGroup | null {
  if (!isObject(value) || !nonEmptyString(value.id) || !Array.isArray(value.memberIds)) return null;
  const memberIds = [...new Set(value.memberIds.filter((id): id is string => typeof id === 'string' && furnitureIds.has(id) && !used.has(id)))];
  if (memberIds.length < 2) return null;
  memberIds.forEach((id) => used.add(id));
  return { id: value.id, name: nonEmptyString(value.name) ? value.name.trim() : 'Gruppe', memberIds };
}

function readFurniture(value: unknown, room: RoomModel, shift: FloorPoint): FurnitureItem | null {
  if (!isObject(value) || !nonEmptyString(value.id)) return null;
  const type = value.type as FurnitureType;
  if (typeof type !== 'string' || !Object.hasOwn(FURNITURE_CATALOG, type)) return null;
  const position = value.position;
  if (!isObject(position) || !finite(position.x) || !finite(position.z)) return null;
  if (!finite(value.width) || !finite(value.depth) || !finite(value.height)) return null;
  return normalizeFurniture(
    {
      id: value.id,
      type,
      // Beim Tippen bleiben Leerzeichen am Ende erhalten (Namen aus mehreren Wörtern); gespeichert wird bereinigt gelesen.
      name: typeof value.name === 'string' ? value.name.trim() : FURNITURE_CATALOG[type].label,
      width: value.width,
      depth: value.depth,
      height: value.height,
      position: { x: position.x + shift.x, z: position.z + shift.z },
      rotationDeg: finite(value.rotationDeg) ? value.rotationDeg : 0,
      colors: readColors(value.colors),
      light: readLight(value.light),
      elevation: finite(value.elevation) ? value.elevation : undefined,
    },
    room,
  );
}

/** Liest eine Liste; ungültige oder doppelte Einträge werden übersprungen und gezählt. */
function readList<T extends { id: string }>(value: unknown, read: (v: unknown) => T | null) {
  const items: T[] = [];
  let skipped = 0;
  if (value !== undefined && !Array.isArray(value)) return { items, skipped: 1 };
  const seen = new Set<string>();
  for (const entry of (value as unknown[] | undefined) ?? []) {
    const item = read(entry);
    if (!item || seen.has(item.id)) {
      skipped++;
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }
  return { items, skipped };
}

/**
 * Liest ein gespeichertes Projekt robust ein: prüft Format und Version, führt
 * Migrationen aus, validiert alle Werte und normalisiert sie wie bei der
 * Bearbeitung. Wirft nie – Fehler kommen als `{ ok: false }` zurück.
 */
export function parseProject(raw: string | null): ParsedProject {
  if (raw === null) return { ok: false, error: 'Projekt nicht gefunden.' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Die gespeicherten Daten sind beschädigt (kein gültiges JSON).' };
  }
  if (!isObject(data) || data.format !== PROJECT_FORMAT) {
    return { ok: false, error: 'Unbekanntes Datenformat.' };
  }
  const id = nonEmptyString(data.id) ? data.id : undefined;
  const name = typeof data.name === 'string' ? cleanProjectName(data.name) : undefined;
  if (!finite(data.version) || data.version < 1) return { ok: false, error: 'Ungültige Formatversion.', id, name };
  if (data.version > PROJECT_FORMAT_VERSION) {
    return { ok: false, error: 'Das Projekt stammt aus einer neueren Version des Raumplaners.', id, name };
  }

  let migrated: Obj = data;
  try {
    for (let v = data.version; v < PROJECT_FORMAT_VERSION; v++) {
      const migrate = MIGRATIONS[v];
      if (!migrate) return { ok: false, error: `Keine Migration von Version ${v} vorhanden.`, id, name };
      migrated = migrate(migrated);
    }
  } catch {
    return { ok: false, error: 'Das Projekt konnte nicht aktualisiert werden.', id, name };
  }

  if (!id) return { ok: false, error: 'Projekt-ID fehlt.', name };
  const plan = migrated.plan;
  if (!isObject(plan)) return { ok: false, error: 'Der Plan fehlt.', id, name };
  const roomResult = readRoom(plan.room);
  if (!roomResult.ok) return { ok: false, error: roomResult.error, id, name };
  const { room: roomPlan, shift } = roomResult;
  const room = roomModelOf(roomPlan);

  openingDefaults.invalid = 0;
  const openings = readList(plan.openings, (v) => readOpening(v, room));
  const furniture = readList(plan.furniture, (v) => readFurniture(v, room, shift));
  const fixtures = readList(plan.fixtures, (v) => readFixture(v, room));
  const furnitureIds = new Set(furniture.items.map((f) => f.id));
  const grouped = new Set<string>();
  const groups = readList(plan.groups, (v) => readGroup(v, furnitureIds, grouped));
  const design = readDesign(plan.design, roomPlan);
  const skipped = openings.skipped + furniture.skipped + fixtures.skipped + groups.skipped;
  const warnings = skipped
    ? [`${skipped} ${skipped === 1 ? 'Element konnte' : 'Elemente konnten'} nicht gelesen werden und ${skipped === 1 ? 'wurde' : 'wurden'} übersprungen.`]
    : [];
  if (openingDefaults.invalid) warnings.push('Einige Tür- oder Fensterdetails waren ungültig – dort gelten Standardwerte.');
  if (design.invalid) warnings.push('Die Gestaltung war teilweise ungültig – dort gelten Standardwerte.');

  const now = new Date().toISOString();
  return {
    ok: true,
    warnings,
    project: {
      format: PROJECT_FORMAT,
      version: PROJECT_FORMAT_VERSION,
      id,
      name: name ?? DEFAULT_PROJECT_NAME,
      createdAt: isoOr(migrated.createdAt, now),
      updatedAt: isoOr(migrated.updatedAt, now),
      plan: {
        room: roomPlan,
        openings: openings.items,
        furniture: furniture.items,
        fixtures: fixtures.items,
        groups: groups.items,
        design: design.design,
      },
    },
  };
}
