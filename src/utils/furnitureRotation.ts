import type { FurnitureItem } from '../types/furniture';
import type { FloorPoint } from '../types/room';
import { normalizeRotation } from './furniture';
import { formationBounds } from './furnitureFormation';
import { fitsInRoom, nearestPositionInRoom } from './room/containment';
import type { RoomModel } from './room/model';
import { roundToPrecision } from './units';

type Rotatable = Pick<FurnitureItem, 'id' | 'width' | 'depth' | 'rotationDeg' | 'position'>;

export interface FurnitureTransform {
  position: FloorPoint;
  rotationDeg: number;
}

/** Drehpunkt einer Auswahl: Mitte der umschließenden Grundflächen (wie der Auswahlrahmen). */
export function formationCenter(items: readonly Rotatable[]): FloorPoint {
  const b = formationBounds(items);
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
}

/** Punkt um `pivot` drehen – im Grundriss im Uhrzeigersinn, wie `rotationDeg` der Möbel. */
export function rotatePoint(p: FloorPoint, pivot: FloorPoint, deg: number): FloorPoint {
  const rad = (deg * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dz = p.z - pivot.z;
  return { x: pivot.x + dx * Math.cos(rad) - dz * Math.sin(rad), z: pivot.z + dx * Math.sin(rad) + dz * Math.cos(rad) };
}

/**
 * Mehrere Möbel gemeinsam drehen: jedes kreist um den Drehpunkt und dreht sich selbst um
 * denselben Winkel – die Anordnung bleibt erhalten (Essgruppe, Sitzecke). Liegt danach ein
 * Möbel außerhalb der Raumkontur, wird die ganze Formation so verschoben, dass alle passen
 * (bis zu vier Korrekturen). Geht das nicht, `null`: Dieser Winkel ist hier nicht möglich.
 */
export function rotateFormation(items: readonly Rotatable[], pivot: FloorPoint, deltaDeg: number, room: RoomModel): Record<string, FurnitureTransform> | null {
  const rotated = items.map((item) => ({
    ...item,
    rotationDeg: normalizeRotation(item.rotationDeg + deltaDeg),
    position: rotatePoint(item.position, pivot, deltaDeg),
  }));
  let shift = { x: 0, z: 0 };
  for (let attempt = 0; attempt < 5; attempt++) {
    const placed = rotated.map((item) => ({
      ...item,
      position: { x: roundToPrecision(item.position.x + shift.x), z: roundToPrecision(item.position.z + shift.z) },
    }));
    const outside = placed.filter((item) => !fitsInRoom(room, item, item.position, true));
    if (outside.length === 0) return Object.fromEntries(placed.map((item) => [item.id, { position: item.position, rotationDeg: item.rotationDeg }]));
    // Größte nötige Korrektur übernehmen und erneut prüfen.
    let best = { x: 0, z: 0 };
    for (const item of outside) {
      const target = nearestPositionInRoom(room, item, item.position);
      const delta = { x: target.x - item.position.x, z: target.z - item.position.z };
      if (Math.hypot(delta.x, delta.z) > Math.hypot(best.x, best.z)) best = delta;
    }
    if (best.x === 0 && best.z === 0) return null;
    shift = { x: shift.x + best.x, z: shift.z + best.z };
  }
  return null;
}
