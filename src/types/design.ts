/** Bodenbeläge. Die ersten fünf IDs stammen aus früheren Versionen und bleiben gültig (gespeicherte Projekte). */
export type FloorMaterialId =
  | 'wood-light'
  | 'wood-dark'
  | 'tiles'
  | 'concrete'
  | 'carpet'
  | 'oak'
  | 'parquet-dark'
  | 'herringbone'
  | 'tiles-large-light'
  | 'tiles-large-dark'
  | 'carpet-light'
  | 'carpet-dark';

/** Farbe als `#rrggbb` (Kleinbuchstaben). */
export type HexColor = string;

/** Oberfläche einer Wand (zusätzlich zur Farbe). */
export type WallFinish = 'matte' | 'plaster' | 'concrete';

/** Lichtstimmung der Grundbeleuchtung. */
export type LightingPreset = 'daylight' | 'warm' | 'neutral' | 'cool';

export interface LightingSettings {
  preset: LightingPreset;
  /** Faktor für die Grundbeleuchtung (1 = Standard). */
  brightness: number;
}

/** Gestaltung des Raums – Teil des Plans (Verlauf, Projekte). */
export interface RoomDesign {
  floor: FloorMaterialId;
  /** Farbe je Wand (Schlüssel = Wand-ID); fehlende Wände nutzen die Standardfarbe. */
  wallColors: Record<string, HexColor>;
  /** Oberfläche je Wand; fehlende Wände sind matt. */
  wallFinishes: Record<string, WallFinish>;
  /** Deckenfarbe (Oberfläche immer matt). */
  ceilingColor: HexColor;
  lighting: LightingSettings;
}
