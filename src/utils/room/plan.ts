import { ROOM_LIMITS, ROOM_TEMPLATES, WALL_THICKNESS } from '../../config/room';
import type { FloorPoint, Meters, RoomDimensions, RoomPlan, RoomShape, RoomWall } from '../../types/room';
import {
  add,
  boundsOf,
  distance,
  dot,
  interiorAngleDeg,
  isFinitePoint,
  lineIntersection,
  normalize,
  polygonSelfIntersects,
  samePoint,
  scale,
  signedArea,
  sub,
} from '../polygon';
import { roundToPrecision } from '../units';
import { roomModelOf } from './model';

/** Ergebnis einer Grundriss-Bearbeitung: neuer (noch nicht normalisierter) Stand oder Begründung. */
export type RoomEdit = { ok: true; plan: RoomPlan } | { ok: false; error: string };

const RECTANGLE_IDS = ['north', 'east', 'south', 'west'] as const;
const roundPoint = (p: FloorPoint): FloorPoint => ({ x: roundToPrecision(p.x), z: roundToPrecision(p.z) });

/** Umriss aus Eckpunkten (Umlaufrichtung des Planers) mit gegebenen Wand-IDs. */
export function wallsFromCorners(
  corners: readonly FloorPoint[],
  ids: readonly string[],
  height: Meters,
  thickness: Meters | readonly Meters[] = WALL_THICKNESS,
): RoomWall[] {
  return corners.map((start, i) => ({
    id: ids[i],
    start,
    end: corners[(i + 1) % corners.length],
    height,
    thickness: typeof thickness === 'number' ? thickness : thickness[i],
  }));
}

const centerOf = (corners: readonly FloorPoint[]): FloorPoint => {
  const b = boundsOf(corners);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
};

/** Rechteck mit lichten Innenmaßen; Wände „north/east/south/west“ wie bisher. */
export function createRectangleRoom({ width, length, height }: RoomDimensions, thickness: Meters | readonly Meters[] = WALL_THICKNESS): RoomPlan {
  const corners = [
    { x: 0, z: 0 },
    { x: width, z: 0 },
    { x: width, z: length },
    { x: 0, z: length },
  ];
  return { shape: 'rectangle', walls: wallsFromCorners(corners, RECTANGLE_IDS, height, thickness), height, origin: centerOf(corners) };
}

const numberedIds = (count: number) => Array.from({ length: count }, (_, i) => `wall-${i + 1}`);

/** L-Form: Rechteck, dessen Ecke rechts unten ausgespart ist (sechs Wände). */
export function createLShapeRoom(height: Meters, template = ROOM_TEMPLATES.lShape): RoomPlan {
  const { width: w, length: l, cutWidth: cw, cutLength: cl } = template;
  const corners = [
    { x: 0, z: 0 },
    { x: w, z: 0 },
    { x: w, z: l - cl },
    { x: w - cw, z: l - cl },
    { x: w - cw, z: l },
    { x: 0, z: l },
  ];
  return { shape: 'l-shape', walls: wallsFromCorners(corners, numberedIds(6), height), height, origin: centerOf(corners) };
}

/** Startform für freie Räume: fünf Wände mit abgeschrägter Ecke – sofort bearbeitbar. */
export function createFreeRoom(height: Meters): RoomPlan {
  const corners = [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 2.5 },
    { x: 3.5, z: 4 },
    { x: 0, z: 4 },
  ];
  return { shape: 'free', walls: wallsFromCorners(corners, numberedIds(5), height), height, origin: centerOf(corners) };
}

export function createRoomForShape(shape: RoomShape, height: Meters, dimensions?: RoomDimensions): RoomPlan {
  if (shape === 'l-shape') return createLShapeRoom(height);
  if (shape === 'free') return createFreeRoom(height);
  return createRectangleRoom({ width: dimensions?.width ?? 5, length: dimensions?.length ?? 4, height });
}

/**
 * Prüft einen Grundriss. `null` = gültig, sonst eine verständliche Begründung.
 * Geprüft werden Zahlen, Geschlossenheit, Mindestlängen, Winkel, Gehrungen und
 * Selbstüberschneidung.
 */
export function validateRoomPlan(plan: RoomPlan): string | null {
  const { walls } = plan;
  if (!Array.isArray(walls) || walls.length < ROOM_LIMITS.minWalls) return 'Ein Raum braucht mindestens drei Wände.';
  if (walls.length > ROOM_LIMITS.maxWalls) return `Höchstens ${ROOM_LIMITS.maxWalls} Wände möglich.`;
  if (!Number.isFinite(plan.height) || plan.height <= 0) return 'Die Raumhöhe ist ungültig.';
  const ids = new Set<string>();
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!w.id || ids.has(w.id)) return 'Wand-IDs sind nicht eindeutig.';
    ids.add(w.id);
    if (!isFinitePoint(w.start) || !isFinitePoint(w.end) || !Number.isFinite(w.thickness)) return 'Der Grundriss enthält ungültige Zahlen.';
    if (!samePoint(w.end, walls[(i + 1) % walls.length].start, 1e-4)) return 'Der Grundriss ist nicht geschlossen.';
    if (w.thickness < ROOM_LIMITS.thickness.min - 1e-9 || w.thickness > ROOM_LIMITS.thickness.max + 1e-9) return 'Die Wandstärke liegt außerhalb des zulässigen Bereichs.';
    const len = distance(w.start, w.end);
    if (len < ROOM_LIMITS.minWallLength - 1e-6) return `Wände müssen mindestens ${Math.round(ROOM_LIMITS.minWallLength * 100)} cm lang sein.`;
    if (len > ROOM_LIMITS.maxWallLength + 1e-6) return `Wände dürfen höchstens ${ROOM_LIMITS.maxWallLength} m lang sein.`;
  }
  const corners = walls.map((w) => w.start);
  const b = boundsOf(corners);
  if (b.maxX - b.minX > ROOM_LIMITS.maxExtent || b.maxZ - b.minZ > ROOM_LIMITS.maxExtent) return `Der Raum darf höchstens ${ROOM_LIMITS.maxExtent} m groß sein.`;
  if (polygonSelfIntersects(corners)) return 'Wände dürfen sich nicht überschneiden.';
  if (Math.abs(signedArea(corners)) < 0.5) return 'Der Raum ist zu klein.';
  const oriented = signedArea(corners) > 0 ? corners : [...corners].reverse();
  for (let i = 0; i < oriented.length; i++) {
    const angle = interiorAngleDeg(oriented[(i - 1 + oriented.length) % oriented.length], oriented[i], oriented[(i + 1) % oriented.length]);
    if (angle < ROOM_LIMITS.minAngleDeg - 1e-6 || angle > 360 - ROOM_LIMITS.minAngleDeg + 1e-6) return 'Die Ecke ist zu spitz.';
  }
  // Gehrungen: Außenflächen müssen eine positive Länge behalten (sonst entartete Wände).
  const model = roomModelOf(signedArea(corners) > 0 ? plan : orientPlan(plan));
  for (const wall of model.walls) {
    if (wall.outerEnd - wall.outerStart < 0.01) return 'Die Wand ist für ihre Wandstärke zu kurz.';
    if (Math.abs(wall.outerStart) > 10 * wall.thickness + 1 || Math.abs(wall.outerEnd - wall.length) > 10 * wall.thickness + 1) return 'Die Ecke ist zu spitz.';
  }
  return null;
}

/** Umlaufrichtung des Planers herstellen (Rauminneres rechts der Wandrichtung). */
function orientPlan(plan: RoomPlan): RoomPlan {
  const corners = plan.walls.map((w) => w.start);
  if (signedArea(corners) >= 0) return plan;
  const reversed = [...plan.walls].reverse().map((w) => ({ ...w, start: w.end, end: w.start }));
  return { ...plan, walls: reversed };
}

/**
 * Normalisiert einen (gültigen) Grundriss: Umlaufrichtung, Wandhöhen und Lage –
 * der Umriss beginnt bei 0/0 (Grundriss). `origin` wird um denselben Betrag
 * verschoben, dadurch bleibt die Lage in der Welt (und auf dem Bildschirm) gleich.
 * `shift` muss auf alle Grundrisspositionen (Möbel) angewendet werden.
 */
export function normalizeRoomPlan(plan: RoomPlan): { plan: RoomPlan; shift: FloorPoint } {
  const oriented = orientPlan(plan);
  const b = boundsOf(oriented.walls.map((w) => w.start));
  const shift = { x: roundToPrecision(-b.minX), z: roundToPrecision(-b.minZ) };
  const move = (p: FloorPoint) => ({ x: roundToPrecision(p.x + shift.x), z: roundToPrecision(p.z + shift.z) });
  const walls = oriented.walls.map((w) => ({ ...w, start: move(w.start), end: move(w.end), height: plan.height }));
  const unchanged =
    oriented === plan && shift.x === 0 && shift.z === 0 && plan.walls.every((w, i) => w.height === plan.height && samePoint(w.start, walls[i].start, 0) && samePoint(w.end, walls[i].end, 0));
  if (unchanged) return { plan, shift };
  return { plan: { ...oriented, walls, origin: { x: plan.origin.x + shift.x, z: plan.origin.z + shift.z } }, shift };
}

const indexOf = (plan: RoomPlan, wallId: string) => plan.walls.findIndex((w) => w.id === wallId);
const at = <T,>(items: readonly T[], i: number) => items[((i % items.length) + items.length) % items.length];

function withCorner(walls: RoomWall[], index: number, point: FloorPoint): RoomWall[] {
  const n = walls.length;
  const prev = (index - 1 + n) % n;
  return walls.map((w, i) => (i === index ? { ...w, start: point } : i === prev ? { ...w, end: point } : w));
}

function checked(plan: RoomPlan): RoomEdit {
  const error = validateRoomPlan(plan);
  return error ? { ok: false, error } : { ok: true, plan };
}

/** Ecke am Anfang der Wand `wallId` verschieben; die beiden angrenzenden Wände folgen. */
export function moveCorner(plan: RoomPlan, wallId: string, point: FloorPoint): RoomEdit {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Ecke nicht gefunden.' };
  if (!isFinitePoint(point)) return { ok: false, error: 'Ungültige Position.' };
  const walls = withCorner(plan.walls, i, roundPoint(point));
  return checked({ ...plan, walls, shape: plan.shape === 'rectangle' ? 'free' : plan.shape === 'l-shape' ? 'free' : plan.shape });
}

/**
 * Wandlänge ändern: Das Wandende wird entlang der Wand verschoben, die folgende
 * Wand parallel mitgeführt (bei mehr als drei Wänden). So bleibt ein Rechteck ein
 * Rechteck und eine L-Form rechtwinklig.
 */
export function setWallLength(plan: RoomPlan, wallId: string, newLength: Meters): RoomEdit {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Wand nicht gefunden.' };
  if (!Number.isFinite(newLength)) return { ok: false, error: 'Ungültige Länge.' };
  const wall = plan.walls[i];
  const axis = normalize(sub(wall.end, wall.start));
  const target = roundPoint(add(wall.start, scale(axis, newLength)));
  const delta = sub(target, wall.end);
  let walls = withCorner(plan.walls, i + 1 === plan.walls.length ? 0 : i + 1, target);
  if (plan.walls.length > 3) {
    const j = (i + 2) % plan.walls.length;
    walls = withCorner(walls, j, roundPoint(add(plan.walls[j].start, delta)));
  }
  return checked({ ...plan, walls });
}

export function setWallThickness(plan: RoomPlan, wallId: string, thickness: Meters): RoomEdit {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Wand nicht gefunden.' };
  const value = roundToPrecision(thickness);
  if (!Number.isFinite(value)) return { ok: false, error: 'Ungültige Wandstärke.' };
  return checked({ ...plan, walls: plan.walls.map((w, k) => (k === i ? { ...w, thickness: value } : w)) });
}

/** Nächste freie ID der Form `wall-N`. */
export function nextWallId(plan: RoomPlan): string {
  let max = 0;
  for (const w of plan.walls) {
    const m = /^wall-(\d+)$/.exec(w.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `wall-${Math.max(max, plan.walls.length) + 1}`;
}

/** Wand in der Mitte teilen: neue Ecke (danach frei verschiebbar). */
export function splitWall(plan: RoomPlan, wallId: string): RoomEdit & { newWallId?: string } {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Wand nicht gefunden.' };
  const wall = plan.walls[i];
  if (distance(wall.start, wall.end) < 2 * ROOM_LIMITS.minWallLength) return { ok: false, error: 'Die Wand ist zum Teilen zu kurz.' };
  const mid = roundPoint({ x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 });
  const newWallId = nextWallId(plan);
  const walls = [...plan.walls];
  walls.splice(i, 1, { ...wall, end: mid }, { ...wall, id: newWallId, start: mid });
  const result = checked({ ...plan, walls, shape: 'free' });
  return result.ok ? { ...result, newWallId } : result;
}

/** Ecke entfernen: die beiden angrenzenden Wände werden zu einer (die vordere bleibt). */
export function removeCorner(plan: RoomPlan, wallId: string): RoomEdit {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Ecke nicht gefunden.' };
  if (plan.walls.length <= ROOM_LIMITS.minWalls) return { ok: false, error: 'Ein Raum braucht mindestens drei Wände.' };
  const n = plan.walls.length;
  const prevIndex = (i - 1 + n) % n;
  const walls = plan.walls
    .map((w, k) => (k === prevIndex ? { ...w, end: plan.walls[i].end } : w))
    .filter((_, k) => k !== i);
  return checked({ ...plan, walls, shape: 'free' });
}

/**
 * Wand entfernen: Die Nachbarwände werden bis zu ihrem Schnittpunkt verlängert.
 * Laufen sie parallel, ist das nicht möglich.
 */
export function removeWall(plan: RoomPlan, wallId: string): RoomEdit {
  const i = indexOf(plan, wallId);
  if (i < 0) return { ok: false, error: 'Wand nicht gefunden.' };
  const n = plan.walls.length;
  if (n <= ROOM_LIMITS.minWalls + 0) return { ok: false, error: 'Ein Raum braucht mindestens drei Wände.' };
  const prev = at(plan.walls, i - 1);
  const next = at(plan.walls, i + 1);
  const meet = lineIntersection(prev.start, sub(prev.end, prev.start), next.start, sub(next.end, next.start));
  if (!meet) return { ok: false, error: 'Die Nachbarwände verlaufen parallel – die Wand kann nicht entfernt werden.' };
  const point = roundPoint(meet);
  // Der Schnittpunkt muss in Laufrichtung beider Nachbarwände liegen.
  if (dot(sub(point, prev.start), sub(prev.end, prev.start)) <= 0 || dot(sub(next.end, point), sub(next.end, next.start)) <= 0) {
    return { ok: false, error: 'Die Wand kann hier nicht entfernt werden.' };
  }
  const prevIndex = (i - 1 + n) % n;
  const nextIndex = (i + 1) % n;
  const walls = plan.walls
    .map((w, k) => (k === prevIndex ? { ...w, end: point } : k === nextIndex ? { ...w, start: point } : w))
    .filter((_, k) => k !== i);
  return checked({ ...plan, walls, shape: 'free' });
}

/** Rechteck: Breite/Länge ändern (Raum bleibt zentriert, Wand-IDs und -stärken bleiben). */
export function resizeRectangle(plan: RoomPlan, dimensions: RoomDimensions): RoomEdit {
  const thickness = plan.walls.map((w) => w.thickness);
  const next = createRectangleRoom(dimensions, thickness.length === 4 ? thickness : WALL_THICKNESS);
  const ids = plan.walls.length === 4 ? plan.walls.map((w) => w.id) : RECTANGLE_IDS;
  const b = boundsOf(plan.walls.map((w) => w.start));
  // Weltlage: Mittelpunkt bleibt, wie bisher beim Ändern der Raummaße.
  const worldCenter = { x: (b.minX + b.maxX) / 2 - plan.origin.x, z: (b.minZ + b.maxZ) / 2 - plan.origin.z };
  return checked({
    ...next,
    walls: next.walls.map((w, k) => ({ ...w, id: ids[k] })),
    origin: { x: next.origin.x - worldCenter.x, z: next.origin.z - worldCenter.z },
  });
}

/** Raumhöhe für alle Wände. */
export function setRoomHeight(plan: RoomPlan, height: Meters): RoomPlan {
  return { ...plan, height, walls: plan.walls.map((w) => ({ ...w, height })) };
}
