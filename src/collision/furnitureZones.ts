import { FURNITURE_CATALOG } from '../config/furniture';
import { chairGeometry, deskGeometry, officeChairGeometry, tableGeometry } from '../config/furnitureGeometry';
import type { FurnitureItem } from '../types/furniture';
import type { Meters } from '../types/room';

/**
 * Semantische Kollisionszonen der Möbel – bewusst keine Mesh-Kollision.
 *
 * Jedes Möbel besteht aus wenigen festen Quadern („Zonen“) im lokalen System
 * (x = Breite, z = Tiefe mit Vorderseite +z, y = Höhe ab Unterkante). Zwei Möbel
 * kollidieren genau dann, wenn sich irgendeine Zone des einen mit einer Zone des
 * anderen im Grundriss UND in der Höhe überschneidet. Was zwischen den Zonen frei
 * bleibt, ist unterfahrbar – z. B. der Raum unter einer Tischplatte zwischen den Beinen.
 *
 * | Form (Katalog `collision`) | Zonen                                                        | Folge                                                    |
 * |----------------------------|--------------------------------------------------------------|----------------------------------------------------------|
 * | `box` (Standard)           | Korpus: voller Quader                                        | normaler fester Körper                                   |
 * | `table` (Esstisch)         | Platte (oben), vier Beine                                    | darunter frei, bis zur Plattenunterkante                 |
 * | `desk` (Schreibtisch)      | Platte, Wange links, Container rechts, Sichtblende hinten    | Beinraum zwischen Wange und Container                    |
 * | `chair` (Stuhl)            | Unterteil (Beine + Sitz bis Sitzhöhe), Lehne hinten          | Sitz passt unter eine Platte, die Lehne nicht            |
 * | `office-chair` (Bürostuhl) | Unterteil (Fuß, Sitz, Armlehnen), Lehne hinten               | passt unter den Schreibtisch, wenn die Armlehnen passen  |
 * | `none` (Teppich)           | keine                                                        | liegt unter Möbeln, Türen schwenken darüber              |
 *
 * Küchenoberschränke sind `box`, hängen aber erhöht (Standhöhe = Unterkante): Ein Unterschrank
 * darunter kollidiert nicht, ein Hochschrank oder Kühlschrank daneben schon – reiner Höhenvergleich.
 *
 * Der Couchtisch bleibt ein `box`: Seine Platte liegt so tief (≈ 0,40 m), dass kein Sitz
 * darunter passt – mit Zonen ergäbe sich dasselbe, nur mit mehr Aufwand.
 * Die Maße stammen aus `config/furnitureGeometry.ts` und damit aus denselben Formeln wie die 3D-Modelle.
 */

export type FurnitureCollisionShape = 'box' | 'table' | 'desk' | 'chair' | 'office-chair' | 'none';

export interface FurnitureZone {
  /** Bauteil, z. B. „Platte“, „Bein“, „Lehne“ – für Tests und Fehlersuche. */
  name: string;
  x0: Meters;
  x1: Meters;
  z0: Meters;
  z1: Meters;
  /** Höhe ab Unterkante des Möbels. */
  y0: Meters;
  y1: Meters;
}

type Shape = Pick<FurnitureItem, 'type' | 'width' | 'depth' | 'height'>;

const zone = (name: string, x0: Meters, x1: Meters, z0: Meters, z1: Meters, y0: Meters, y1: Meters): FurnitureZone => ({ name, x0, x1, z0, z1, y0, y1 });

/** Voller Quader (Hülle) – auch für Regeln, die das ganze Möbel betreffen (Heizkörper). */
export function envelopeZone({ width: w, depth: d, height: h }: Shape): FurnitureZone {
  return zone('Korpus', -w / 2, w / 2, -d / 2, d / 2, 0, h);
}

export function collisionShapeOf(type: FurnitureItem['type']): FurnitureCollisionShape {
  return FURNITURE_CATALOG[type].collision ?? 'box';
}

/** Kollisionszonen eines Möbels (lokales System, siehe oben). */
export function furnitureZones(item: Shape): FurnitureZone[] {
  const { width: w, depth: d, height: h } = item;
  switch (collisionShapeOf(item.type)) {
    case 'table': {
      const g = tableGeometry(w, d, h);
      const legs = [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => {
          const cx = sx * (w / 2 - g.insetX);
          const cz = sz * (d / 2 - g.insetZ);
          return zone('Bein', cx - g.leg / 2, cx + g.leg / 2, cz - g.leg / 2, cz + g.leg / 2, 0, g.legH);
        }),
      );
      return [zone('Platte', -w / 2, w / 2, -d / 2, d / 2, g.legH, h), ...legs];
    }
    case 'desk': {
      const g = deskGeometry(w, d, h);
      const panelZ = -d / 2 + g.panelFromBack;
      return [
        zone('Platte', -w / 2, w / 2, -d / 2, d / 2, g.under, h),
        zone('Wange', -w / 2, -w / 2 + g.side, -(d - 0.04) / 2, (d - 0.04) / 2, 0, g.under),
        // Container inklusive Schubladenfronten und Griffen bis zur Vorderkante.
        zone('Container', w / 2 - g.pedestalWidth, w / 2, -d / 2 + 0.03, d / 2, 0, g.under),
        zone('Sichtblende', -w / 2 + g.side, w / 2 - g.pedestalWidth, panelZ - g.panelT / 2, panelZ + g.panelT / 2, g.under - g.panelH, g.under),
      ];
    }
    case 'chair': {
      const g = chairGeometry(h);
      return [
        zone('Unterteil', -w / 2, w / 2, -d / 2, d / 2, 0, g.seatH),
        // Hintere Beine laufen als Pfosten bis oben; dazwischen das Rückenbrett.
        zone('Lehne', -w / 2, w / 2, -d / 2, -d / 2 + g.leg + 0.01, g.seatH, h),
      ];
    }
    case 'office-chair': {
      const g = officeChairGeometry(h);
      return [
        zone('Unterteil', -w / 2, w / 2, -d / 2, d / 2, 0, Math.min(h, g.armTop)),
        zone('Lehne', -w / 2, w / 2, -d / 2, -d / 2 + g.backDepth, h - g.backH, h),
      ];
    }
    case 'none':
      return [];
    default:
      return [envelopeZone(item)];
  }
}
