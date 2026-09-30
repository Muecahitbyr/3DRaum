import type { Meters, RoomDimensionKey, RoomDimensions } from '../types/room';

export const DEFAULT_ROOM_DIMENSIONS: RoomDimensions = {
  width: 5,
  length: 4,
  height: 2.5,
};

export interface DimensionConstraint {
  label: string;
  min: Meters;
  max: Meters;
  step: Meters;
}

export const ROOM_DIMENSION_CONSTRAINTS: Record<RoomDimensionKey, DimensionConstraint> = {
  width: { label: 'Breite', min: 1, max: 30, step: 0.1 },
  length: { label: 'Länge', min: 1, max: 30, step: 0.1 },
  height: { label: 'Höhe', min: 1.8, max: 6, step: 0.05 },
};

/** Reihenfolge der Eingabefelder in der Sidebar. */
export const ROOM_DIMENSION_KEYS: readonly RoomDimensionKey[] = ['width', 'length', 'height'];

/** Standard-Wandstärke neuer Wände. */
export const WALL_THICKNESS: Meters = 0.15;

/** Grenzen für Grundrisse (Robustheit). */
export const ROOM_LIMITS = {
  minWallLength: 0.2,
  maxWallLength: 30,
  thickness: { min: 0.05, max: 0.5 },
  /** Kleinster Innenwinkel an einer Ecke (Grad) – spitzere Ecken erzeugen unbrauchbare Gehrungen. */
  minAngleDeg: 15,
  /** Maximale Ausdehnung des Grundrisses. */
  maxExtent: 40,
  minWalls: 3,
  maxWalls: 24,
} as const;

/** Vorlagen für neue Räume (Innenmaße). */
export const ROOM_TEMPLATES = {
  /** L-Form: 6 × 5 m, rechts unten 2,5 × 2 m ausgespart. */
  lShape: { width: 6, length: 5, cutWidth: 2.5, cutLength: 2 },
} as const;

export const ROOM_SHAPE_LABELS = {
  rectangle: 'Rechteck',
  'l-shape': 'L-Form',
  free: 'Freie Form',
} as const;

/** Grundriss-Editor: Einrasten in Bildschirmpixeln. */
export const ROOM_EDITOR_CONFIG = {
  snapDistancePx: 10,
  /** Winkel-Einrasten (Grad) bei Wandrichtungen nahe 0/45/90°. */
  angleSnapDeg: 4,
  dragStartTolerancePx: 3,
} as const;
