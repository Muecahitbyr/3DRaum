import { BUILDING_CONFIG } from '../../config/building';
import type { Opening } from '../../types/opening';
import type { FloorPoint, WallSegment } from '../../types/room';
import { dot, sub } from '../polygon';
import type { RoomModel } from '../room/model';
import { roundToPrecision } from '../units';
import type { WallCutout } from '../wallGeometry';

const EPSILON = 1e-6;
/** Gegenläufig parallel (cos des Winkels zwischen den Wandrichtungen). */
const ANTI_PARALLEL_COS = -0.999;

/** Zimmer einer Etage für die Berechnung gemeinsamer Wände. */
export interface SharedWallRoom {
  id: string;
  room: RoomModel;
  openings: readonly Opening[];
}

/** Ergebnis je Wand: was ein anderes Zimmer zeichnet und welche fremden Öffnungen sie durchbrechen. */
export interface WallShare {
  /**
   * Abschnitte (lokales Wandsystem wie `WallCutout`), die ein Nachbarzimmer an seiner Stelle
   * zeichnet – hier entfällt die Wand, sonst lägen zwei Wände deckungsgleich übereinander.
   */
  hidden: WallCutout[];
  /** Öffnungen des Nachbarzimmers in der gemeinsamen Wand, umgerechnet auf diese Wand. */
  foreign: Opening[];
  /** Länge der Wand (m), die sie mit Nachbarzimmern teilt. */
  covered: number;
}

/** Gemeinsame Wände je Zimmer-ID und Wand-ID (nur Wände mit Nachbarn). */
export type SharedWalls = ReadonlyMap<string, ReadonlyMap<string, WallShare>>;

export const EMPTY_SHARED_WALLS: SharedWalls = new Map();

/** Welt-Punkt auf der Innenfläche einer Wand. */
const along = (wall: WallSegment, t: number): FloorPoint => ({ x: wall.start.x + wall.axis.x * t, z: wall.start.z + wall.axis.z * t });
const project = (wall: WallSegment, p: FloorPoint) => dot(sub(p, wall.start), wall.axis);

/**
 * Liegen zwei Wände Rücken an Rücken (gemeinsame Wand)? `a` gehört zum einen, `b` zum anderen
 * Zimmer. Dann ist die Innenfläche von `b` höchstens eine Wandstärke von der Innenfläche von `a`
 * entfernt (auf der Außenseite von `a`), beide laufen gegenläufig und überdecken sich.
 * Ergebnis: überdeckter Bereich entlang `a` (ab Wandanfang) oder `null`.
 */
export function sharedSpan(a: WallSegment, b: WallSegment): { from: number; to: number } | null {
  if (dot(a.axis, b.axis) > ANTI_PARALLEL_COS) return null;
  const outward = { x: -a.inward.x, z: -a.inward.z };
  const d0 = dot(sub(b.start, a.start), outward);
  const d1 = dot(sub(b.end, a.start), outward);
  const limit = Math.max(a.thickness, b.thickness) + BUILDING_CONFIG.sharedWallTolerance;
  if (Math.min(d0, d1) < -BUILDING_CONFIG.sharedWallTolerance || Math.max(d0, d1) > limit) return null;
  const s0 = project(a, b.start);
  const s1 = project(a, b.end);
  const from = Math.max(0, Math.min(s0, s1));
  const to = Math.min(a.length, Math.max(s0, s1));
  return to - from >= BUILDING_CONFIG.sharedWallMinOverlap ? { from, to } : null;
}

/**
 * Öffnung der Wand `from` auf die gegenüberliegende Wand `to` übertragen: gleiche Weltlage,
 * aus Sicht des anderen Zimmers gespiegelt (Anschlag links ↔ rechts, Öffnungsrichtung innen ↔ außen).
 */
export function mirrorOpening(opening: Opening, from: WallSegment, to: WallSegment, idPrefix: string): Opening | null {
  const s0 = project(to, along(from, opening.offset));
  const s1 = project(to, along(from, opening.offset + opening.width));
  const start = Math.max(0, Math.min(s0, s1));
  const end = Math.min(to.length, Math.max(s0, s1));
  if (end - start < EPSILON) return null;
  const base = { id: `${idPrefix}:${opening.id}`, wall: to.id, offset: roundToPrecision(start), width: roundToPrecision(end - start), height: opening.height };
  if (opening.type === 'door') {
    return {
      ...base,
      type: 'door',
      hinge: opening.hinge === 'left' ? 'right' : 'left',
      swing: opening.swing === 'inward' ? 'outward' : 'inward',
    };
  }
  if (opening.type === 'window') return { ...base, type: 'window', sillHeight: opening.sillHeight, sashes: opening.sashes };
  return { ...base, type: 'passage' };
}

/**
 * Gemeinsame Wände aller Zimmer einer Etage. `rooms` ist nach Vorrang sortiert (das aktive
 * Zimmer zuerst): Bei einer gemeinsamen Wand zeichnet das Zimmer mit Vorrang die Wand,
 * beim anderen entfällt sie dort. Öffnungen des anderen Zimmers in diesem Abschnitt
 * durchbrechen die gezeichnete Wand (z. B. die Tür zwischen Flur und Küche).
 */
export function computeSharedWalls(rooms: readonly SharedWallRoom[]): SharedWalls {
  const result = new Map<string, Map<string, WallShare>>();
  const shareOf = (roomId: string, wallId: string): WallShare => {
    let walls = result.get(roomId);
    if (!walls) result.set(roomId, (walls = new Map()));
    let share = walls.get(wallId);
    if (!share) walls.set(wallId, (share = { hidden: [], foreign: [], covered: 0 }));
    return share;
  };

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const owner = rooms[i];
      const other = rooms[j];
      // Schneller Ausschluss: Hüllen (inkl. Wandstärken) berühren sich nicht.
      const ob = owner.room.outerBounds;
      const tb = other.room.outerBounds;
      const gap = BUILDING_CONFIG.sharedWallTolerance;
      if (ob.minX > tb.maxX + gap || tb.minX > ob.maxX + gap || ob.minZ > tb.maxZ + gap || tb.minZ > ob.maxZ + gap) continue;

      for (const a of owner.room.walls) {
        for (const b of other.room.walls) {
          const span = sharedSpan(a, b);
          if (!span) continue;
          // Beim Zimmer ohne Vorrang entfällt die Wand im gemeinsamen Abschnitt (bis zur Höhe der
          // gezeichneten Wand). Reicht der Abschnitt bis an ein Wandende, entfällt auch die Gehrung.
          const b0 = project(b, along(a, span.from));
          const b1 = project(b, along(a, span.to));
          const lo = Math.max(0, Math.min(b0, b1));
          const hi = Math.min(b.length, Math.max(b0, b1));
          const half = b.length / 2;
          shareOf(owner.id, a.id).covered += span.to - span.from;
          shareOf(other.id, b.id).covered += hi - lo;
          shareOf(other.id, b.id).hidden.push({
            x0: lo <= BUILDING_CONFIG.sharedWallTolerance ? -Infinity : lo - half,
            x1: hi >= b.length - BUILDING_CONFIG.sharedWallTolerance ? Infinity : hi - half,
            y0: 0,
            y1: Math.min(a.height, b.height),
          });
          // Öffnungen des anderen Zimmers im gemeinsamen Abschnitt → in die gezeichnete Wand.
          for (const opening of other.openings) {
            if (opening.wall !== b.id) continue;
            if (opening.offset + opening.width <= lo + EPSILON || opening.offset >= hi - EPSILON) continue;
            const mirrored = mirrorOpening(opening, b, a, other.id);
            if (mirrored) shareOf(owner.id, a.id).foreign.push(mirrored);
          }
        }
      }
    }
  }
  return result;
}

/** Wände eines Zimmers, die (nahezu) vollständig mit Nachbarzimmern geteilt sind. */
export function fullySharedWalls(shared: SharedWalls, room: { id: string; walls: readonly WallSegment[] }): Set<string> {
  const walls = shared.get(room.id);
  return new Set(room.walls.filter((w) => (walls?.get(w.id)?.covered ?? 0) >= w.length - BUILDING_CONFIG.sharedWallMinOverlap).map((w) => w.id));
}

/** Alle fremden Öffnungen in den Wänden eines Zimmers (für Kollisionen). */
export function foreignOpeningsOf(shared: SharedWalls, roomId: string): Opening[] {
  const walls = shared.get(roomId);
  return walls ? [...walls.values()].flatMap((share) => share.foreign) : [];
}
