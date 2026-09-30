import { OPENING_DRAG_CONFIG } from '../config/openings';
import type { FloorPoint, Meters, WallSegment } from '../types/room';
import type { WallSpanItem } from './openings';
import type { RoomModel } from './room/model';
import { clamp, roundToPrecision } from './units';

const EPSILON = 1e-6;

export type SnapKind = 'corner' | 'center' | 'opening';

export interface SnapInfo {
  kind: SnapKind;
  /** Position der Einrastlinie entlang der Wand (Grundriss-Leserichtung). */
  along: Meters;
}

export interface DragPlacement {
  wall: string;
  offset: Meters;
  snap: SnapInfo | null;
}

/** Position eines Punkts entlang der Wand und sein Abstand zum Wandband (0 = auf der Wand). */
export function measureAgainstWall(frame: WallSegment, point: FloorPoint) {
  const wallThickness = frame.thickness;
  const dx = point.x - frame.start.x;
  const dz = point.z - frame.start.z;
  const along = dx * frame.axis.x + dz * frame.axis.z;
  const into = dx * frame.inward.x + dz * frame.inward.z;
  // Abstand zum Wandband zwischen Innen- (into = 0) und Außenkante (into = -Dicke).
  const across = into > 0 ? into : Math.max(0, -into - wallThickness);
  const beyondEnds = Math.max(0, -along, along - frame.length);
  return { along, distance: Math.hypot(across, beyondEnds) };
}

/**
 * Berechnet die neue Lage eines gezogenen Elements.
 *
 * 1. Wand: Die aktuelle Wand bleibt, bis eine andere Wand deutlich näher ist
 *    (Hysterese) und der Zeiger in ihrer Nähe liegt. Wände, die kürzer als das
 *    Element sind, kommen nicht in Frage – Maße ändern sich beim Ziehen nie.
 * 2. Position: Zeigerposition minus Greifpunkt, begrenzt auf die Wand.
 * 3. Snap: Leichtes Einrasten an Wandecken, Wandmitte und Nachbarelementen,
 *    nur innerhalb weniger Bildschirmpixel. Danach Rundung auf 1 cm.
 */
export function computeDragPlacement(
  opening: WallSpanItem,
  pointer: FloorPoint,
  /**
   * Greifpunkt relativ zur Elementmitte in Grundriss-Leserichtung (links → rechts bzw.
   * oben → unten). So bleibt das Element beim Wechsel auf eine gegenläufige Wand unter dem Zeiger.
   */
  grabFromCenter: Meters,
  openings: readonly WallSpanItem[],
  room: RoomModel,
  metersPerPixel: number,
  /** Zusätzlich mittig an Nachbarn einrasten (z. B. Heizkörper unter einem Fenster). */
  alignCenters = false,
): DragPlacement {
  const cfg = OPENING_DRAG_CONFIG;
  const hysteresis = Math.max(cfg.wallSwitchHysteresisMinM, cfg.wallSwitchHysteresisPx * metersPerPixel);
  const switchRadius = Math.max(cfg.wallSwitchRadiusMinM, cfg.wallSwitchRadiusPx * metersPerPixel);

  const candidates = room.walls
    .map((frame) => ({ side: frame.id, frame, ...measureAgainstWall(frame, pointer) }))
    .filter((c) => c.side === opening.wall || c.frame.length >= opening.width - EPSILON);

  let best = candidates.find((c) => c.side === opening.wall) ?? candidates[0];
  let bestScore = best.side === opening.wall ? best.distance - hysteresis : Infinity;
  for (const c of candidates) {
    if (c.side !== opening.wall && c.distance <= switchRadius && c.distance < bestScore) {
      best = c;
      bestScore = c.distance;
    }
  }

  const { frame } = best;
  const maxOffset = Math.max(0, frame.length - opening.width);
  const half = opening.width / 2;
  const grab = clamp(frame.readingReversed ? -grabFromCenter : grabFromCenter, -half, half);
  const raw = clamp(best.along - half - grab, 0, maxOffset);

  const snapTargets: { offset: Meters; snap: SnapInfo }[] = [
    { offset: 0, snap: { kind: 'corner', along: 0 } },
    { offset: maxOffset, snap: { kind: 'corner', along: frame.length } },
    { offset: (frame.length - opening.width) / 2, snap: { kind: 'center', along: frame.length / 2 } },
  ];
  for (const other of openings) {
    if (other.id === opening.id || other.wall !== frame.id) continue;
    const otherEnd = other.offset + other.width;
    snapTargets.push({ offset: otherEnd, snap: { kind: 'opening', along: otherEnd } });
    snapTargets.push({ offset: other.offset - opening.width, snap: { kind: 'opening', along: other.offset } });
    if (alignCenters) {
      const center = other.offset + other.width / 2;
      snapTargets.push({ offset: center - opening.width / 2, snap: { kind: 'opening', along: center } });
    }
  }

  const snapDistance = cfg.snapDistancePx * metersPerPixel;
  let snapped: { offset: Meters; snap: SnapInfo } | null = null;
  for (const target of snapTargets) {
    if (target.offset < -EPSILON || target.offset > maxOffset + EPSILON) continue;
    const delta = Math.abs(target.offset - raw);
    if (delta <= snapDistance && (!snapped || delta < Math.abs(snapped.offset - raw))) snapped = target;
  }

  const offset = roundToPrecision(clamp(snapped ? snapped.offset : raw, 0, maxOffset));
  return { wall: frame.id, offset, snap: snapped?.snap ?? null };
}
