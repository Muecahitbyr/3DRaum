/**
 * Einheiten-Konvention für den gesamten Planer:
 * - Alle Längen werden intern in Metern gespeichert (1 Three.js-Einheit = 1 m).
 * - Achsen: x = Breite, z = Länge, y = Höhe. Der Boden liegt auf y = 0.
 * - Grundrisskoordinaten (Wände, Möbel) messen ab der linken bzw. oberen Kante des
 *   Raum-Innenumrisses (x nach rechts, z nach unten). Weltkoordinaten = Grundriss − `origin`
 *   des Raums; ein neuer Raum liegt damit im Ursprung zentriert.
 */
export type Meters = number;

/** Lichte Maße (Umriss-Hülle) und Raumhöhe. */
export interface RoomDimensions {
  width: Meters;
  length: Meters;
  height: Meters;
}

export type RoomDimensionKey = keyof RoomDimensions;

/** Punkt in der Bodenebene (x/z) in Metern. */
export interface FloorPoint {
  x: Meters;
  z: Meters;
}

/** Himmelsrichtung (nur noch Beschriftung/Vorlieben – keine Voraussetzung der Geometrie). */
export type WallSide = 'north' | 'east' | 'south' | 'west';

/**
 * Gespeicherte Wand: Strecke entlang der Wand-INNENFLÄCHE in Grundrisskoordinaten.
 * Die Wände bilden einen geschlossenen Umriss: Ende einer Wand = Anfang der nächsten.
 * Sie laufen – vom Rauminneren aus gesehen – von links nach rechts; die Wandstärke
 * liegt außen.
 */
export interface RoomWall {
  id: string;
  start: FloorPoint;
  end: FloorPoint;
  height: Meters;
  thickness: Meters;
}

/** Form, mit der der Raum angelegt wurde (bzw. zu der er geworden ist). */
export type RoomShape = 'rectangle' | 'l-shape' | 'free';

/** Geometrie des Raums (Teil des Plans und des Verlaufs). */
export interface RoomPlan {
  shape: RoomShape;
  walls: RoomWall[];
  /** Raumhöhe = Höhe aller Wände. */
  height: Meters;
  /**
   * Grundrisspunkt, der im Weltursprung liegt. Bleibt bei Bearbeitungen fest,
   * damit der Raum auf dem Bildschirm nicht springt.
   */
  origin: FloorPoint;
}

/**
 * Abgeleitete Wand für Berechnung und Darstellung (Weltkoordinaten).
 * Lokales Wandsystem: Ursprung auf der Wandmittellinie in Wandmitte, x entlang der
 * Wand (vom Anfang zum Ende), y nach oben, +z ins Rauminnere; Innenfläche bei z = +Dicke/2.
 */
export interface WallSegment {
  id: string;
  index: number;
  /** Innenfläche: Anfangs- und Endpunkt (Welt). */
  start: FloorPoint;
  end: FloorPoint;
  /** Dieselben Punkte in Grundrisskoordinaten. */
  planStart: FloorPoint;
  planEnd: FloorPoint;
  /** Lichte Länge (Innenfläche). */
  length: Meters;
  /** Einheitsvektor vom Anfang zum Ende. */
  axis: FloorPoint;
  /** Einheitsvektor ins Rauminnere. */
  inward: FloorPoint;
  thickness: Meters;
  height: Meters;
  /** Außenfläche (Gehrung an den Ecken): Lage entlang der Wand ab dem Innen-Anfangspunkt. */
  outerStart: Meters;
  outerEnd: Meters;
  /** Lokales Wandsystem: Ursprung (Welt) und Drehung um y. */
  center: FloorPoint;
  rotationY: number;
  /** Positionsangaben in der Oberfläche laufen „von links/oben“: bei `true` entgegen der Wandrichtung. */
  readingReversed: boolean;
  /** Eher waagerecht (Abstand „von links“) statt senkrecht („von oben“). */
  horizontal: boolean;
  /** Himmelsrichtung, wenn die Wand ungefähr achsparallel liegt. */
  facing: WallSide | null;
  /** Anzeigename, z. B. „Nord (oben)“ oder „Wand 3 (schräg)“. */
  label: string;
}

/** Maßkette entlang einer Wand, gemessen zwischen zwei Innenecken (Welt). */
export interface WallDimension {
  id: string;
  start: FloorPoint;
  end: FloorPoint;
  /** Einheitsvektor, der vom Raum nach außen zeigt. */
  outwardNormal: FloorPoint;
  /** Abstand von der Innenkante bis zur Außenkante der Wand. */
  wallThickness: Meters;
  length: Meters;
}
