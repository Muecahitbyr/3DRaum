import type { FloorPoint, Meters } from './room';

/**
 * Möbeltypen. Die ersten vier IDs stammen aus der ersten Version und bleiben
 * unverändert, damit gespeicherte Projekte weiterhin geöffnet werden können.
 */
export type FurnitureType =
  | 'bed'
  | 'wardrobe'
  | 'sofa'
  | 'table'
  | 'armchair'
  | 'coffee-table'
  | 'tv-board'
  | 'shelf'
  | 'double-bed'
  | 'dresser'
  | 'nightstand'
  | 'chair'
  | 'sideboard'
  | 'desk'
  | 'office-chair'
  | 'ceiling-light'
  | 'pendant-light'
  | 'floor-lamp'
  | 'table-lamp';

/** Einstellbare Farbbereiche eines Möbels (nicht jedes Bauteil einzeln). */
export type FurnitureColorSlot = 'main' | 'wood' | 'fabric';

/** Licht einer Lampe. */
export interface LampLight {
  on: boolean;
  /** Helligkeit als Faktor (1 = Standard des Lampentyps). */
  intensity: number;
  /** Farbtemperatur in Kelvin (2200 warm … 6500 kalt). */
  temperature: number;
}

/**
 * Außenmaße (Bounding Box) im lokalen Möbel-Koordinatensystem:
 * Breite = x, Tiefe = z, Höhe = y. Die Vorderseite zeigt nach +z.
 */
export interface FurnitureSize {
  width: Meters;
  depth: Meters;
  height: Meters;
}

export interface FurnitureItem extends FurnitureSize {
  id: string;
  type: FurnitureType;
  name: string;
  /**
   * Mittelpunkt im Grundriss, gemessen ab der Innenecke oben links:
   * x nach rechts (ab Westwand), z nach unten (ab Nordwand).
   */
  position: FloorPoint;
  /** Drehung um die Hochachse in Grad, im Grundriss im Uhrzeigersinn, [0, 360). */
  rotationDeg: number;
  /** Abweichende Farben je Bereich; fehlende Bereiche nutzen die Standardfarbe des Typs. */
  colors?: Partial<Record<FurnitureColorSlot, string>>;
  /** Nur Lampen: Licht (Ein/Aus, Helligkeit, Farbtemperatur). */
  light?: LampLight;
  /** Nur Tischlampen: Standhöhe über dem Boden (z. B. Tischplatte). */
  elevation?: Meters;
}

export type FurniturePatch = Partial<Omit<FurnitureItem, 'id' | 'type'>>;

/** Gruppe mehrerer Möbel (z. B. Esstisch + Stühle). Die Möbel bleiben normale Möbel. */
export interface FurnitureGroup {
  id: string;
  name: string;
  memberIds: string[];
}
