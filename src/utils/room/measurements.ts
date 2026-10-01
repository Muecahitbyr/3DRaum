import type { Meters, WallSegment } from '../../types/room';
import { polygonArea, polygonPerimeter } from '../polygon';
import { readingOffset } from './model';

/**
 * Maße für Anzeige und Export, berechnet aus der tatsächlichen Raumkontur
 * (Innenumriss) – nie aus der Hülle. Gilt für Rechteck, L-Form, freie Formen und schräge Wände.
 */
export interface RoomMeasurements {
  /** Lichte Grundfläche in m². */
  area: number;
  /** Raumumfang entlang der Wand-Innenflächen in m. */
  perimeter: Meters;
}

export function roomMeasurements(room: { polygon: readonly { x: number; z: number }[] }): RoomMeasurements {
  return { area: polygonArea(room.polygon), perimeter: polygonPerimeter(room.polygon) };
}

/** Wandgebundenes Element mit Lage entlang der Wand (gespeichert ab Wandanfang). */
interface WallSpan {
  offset: Meters;
  width: Meters;
}

/** Seiten einer Wand in Grundriss-Leserichtung („links/rechts“ bzw. „oben/unten“). */
export interface ReadingSides {
  start: string;
  end: string;
}

export const readingSides = (wall: Pick<WallSegment, 'horizontal'>): ReadingSides =>
  wall.horizontal ? { start: 'links', end: 'rechts' } : { start: 'oben', end: 'unten' };

/**
 * Lagemaße eines Elements in Grundriss-Leserichtung: Abstand der Anfangsecke
 * (links bzw. oben) bis zur Elementkante und Restabstand bis zur Endecke.
 * Gemessen entlang der tatsächlichen Wand (auch schräg).
 */
export function readingDistances(wall: Pick<WallSegment, 'length' | 'readingReversed'>, item: WallSpan): { start: Meters; end: Meters } {
  const start = readingOffset(wall, item.offset, item.width);
  return { start, end: wall.length - item.width - start };
}

/**
 * Gespeicherte Position (ab Wandanfang) für einen gewünschten Abstand zu einer Wandseite.
 * Begrenzen auf die Wand übernimmt danach die Normalisierung des Elements.
 */
export function offsetForReadingDistance(
  wall: Pick<WallSegment, 'length' | 'readingReversed'>,
  width: Meters,
  side: keyof ReadingSides,
  distance: Meters,
): Meters {
  const start = side === 'start' ? distance : wall.length - width - distance;
  return readingOffset(wall, start, width);
}

/** Abschnitt einer Maßkette entlang der Wand. */
export interface ChainSegment {
  from: Meters;
  to: Meters;
  length: Meters;
  /** `true` = Öffnungsbreite, sonst Wandstück zwischen Ecken/Öffnungen. */
  opening: boolean;
}

/** Punkte, die näher beieinander liegen, gelten als derselbe Messpunkt (0,1 mm). */
const SAME_POINT = 1e-4;

/**
 * Maßkette einer Wand: alle Wandecken und Öffnungskanten als Messpunkte, dazwischen die
 * Abschnitte. Positionen entlang der Wand ab Wandanfang (0 … Länge). Überlappende
 * Öffnungen (Kollision) ergeben trotzdem eine gültige, lückenlose Kette.
 */
export function openingChain(wallLength: Meters, spans: readonly WallSpan[]): ChainSegment[] {
  if (spans.length === 0 || wallLength <= 0) return [];
  const clampAlong = (v: number) => Math.min(wallLength, Math.max(0, v));
  const raw = [0, wallLength, ...spans.flatMap((s) => [clampAlong(s.offset), clampAlong(s.offset + s.width)])].sort((a, b) => a - b);
  const points: number[] = [];
  for (const p of raw) if (points.length === 0 || p - points[points.length - 1] > SAME_POINT) points.push(p);
  // Endpunkt exakt auf die Wandlänge legen (Rundung beim Zusammenfassen).
  points[points.length - 1] = wallLength;
  const segments: ChainSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const mid = (from + to) / 2;
    segments.push({ from, to, length: to - from, opening: spans.some((s) => mid > s.offset && mid < s.offset + s.width) });
  }
  return segments;
}

/** Kette in Grundriss-Leserichtung (für die Darstellung von links/oben nach rechts/unten). */
export function toReadingChain(wall: Pick<WallSegment, 'length' | 'readingReversed'>, chain: readonly ChainSegment[]): ChainSegment[] {
  if (!wall.readingReversed) return [...chain];
  return chain.map((s) => ({ ...s, from: wall.length - s.to, to: wall.length - s.from })).reverse();
}

export type LabelPlacement = 'inline' | 'outside' | 'hidden';

export interface LabelSlot {
  placement: LabelPlacement;
  /** Mitte des Etiketts entlang der Maßlinie (gleiche Einheit wie die Eingaben). */
  center: number;
}

/**
 * Ruhige Beschriftung einer Maßkette (alle Werte in derselben Einheit, z. B. Pixel):
 * 1. Passt ein Etikett mit Luft in seinen Abschnitt, steht es dort („inline“).
 * 2. Sonst auf einer zweiten Spur außerhalb der Kette („outside“), mittig über dem
 *    Abschnitt; überlappt es dort ein vorheriges Etikett, wird es höchstens um die eigene
 *    Breite weitergeschoben.
 * 3. Andernfalls entfällt es („hidden“) – lieber ein Maß weniger als übereinanderliegende Texte.
 */
export function layoutChainLabels(segments: readonly { from: number; to: number }[], widths: readonly number[], gap: number): LabelSlot[] {
  let laneEnd = -Infinity;
  return segments.map((segment, i) => {
    const width = widths[i];
    const mid = (segment.from + segment.to) / 2;
    if (segment.to - segment.from >= width + 2 * gap) return { placement: 'inline', center: mid };
    const desired = mid - width / 2;
    const start = Math.max(desired, laneEnd + gap);
    if (start - desired > width) return { placement: 'hidden', center: mid };
    laneEnd = start + width;
    return { placement: 'outside', center: start + width / 2 };
  });
}
