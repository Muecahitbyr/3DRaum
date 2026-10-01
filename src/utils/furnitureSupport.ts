import { rectanglePolygon } from '../collision/geometry';
import { FURNITURE_CATALOG, isCeilingMounted } from '../config/furniture';
import type { FurnitureItem } from '../types/furniture';
import type { Meters } from '../types/room';
import { pointInPolygon } from './polygon';

/**
 * Tischlampen stehen automatisch auf Möbeln mit nutzbarer Oberseite (Katalog `surface`:
 * Nachttisch, Schreibtisch, Kommode, Sideboard, Esstisch, Couchtisch, TV-Board).
 *
 * Reine Platzierungsregel, keine Physik und kein neues Koordinatensystem: Liegt der
 * Mittelpunkt der Lampe über der Grundfläche eines Trägers, ist ihre wirksame Standhöhe
 * dessen Oberkante (bei mehreren die höchste). Sonst gilt die gespeicherte Standhöhe
 * (`elevation`) wie bisher – zieht man die Lampe weg, steht sie wieder dort.
 */

type Placed = Pick<FurnitureItem, 'id' | 'type' | 'position' | 'width' | 'depth' | 'height' | 'rotationDeg' | 'elevation'>;

/** Kann dieses Möbel auf einem anderen stehen (Tischlampe)? */
export const canStandOnSurface = (type: FurnitureItem['type']) => !!FURNITURE_CATALOG[type].elevation;

/** Träger unter dem Mittelpunkt (höchste Oberkante) oder `null`. */
export function supportOf<T extends Placed>(item: Placed, all: readonly T[]): T | null {
  if (!canStandOnSurface(item.type)) return null;
  let best: T | null = null;
  for (const other of all) {
    if (other.id === item.id || !FURNITURE_CATALOG[other.type].surface || isCeilingMounted(other.type)) continue;
    if (!pointInPolygon(item.position, rectanglePolygon(other.position, other.width / 2, other.depth / 2, other.rotationDeg))) continue;
    if (!best || other.height > best.height) best = other;
  }
  return best;
}

/**
 * Wirksame Standhöhen aller Lampen, die gerade auf einem Träger stehen (Möbel-ID → Höhe).
 * Begrenzt, damit die Lampe nicht durch die Decke ragt.
 */
export function supportElevations(all: readonly Placed[], roomHeight: Meters): ReadonlyMap<string, Meters> {
  const result = new Map<string, Meters>();
  for (const item of all) {
    const carrier = supportOf(item, all);
    if (carrier) result.set(item.id, Math.max(0, Math.min(carrier.height, roomHeight - item.height)));
  }
  return result;
}
