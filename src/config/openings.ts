import type { OpeningType } from '../types/opening';
import type { Meters, WallSide } from '../types/room';

export interface OpeningDefaults {
  width: Meters;
  height: Meters;
  sillHeight: Meters;
}

export const OPENING_DEFAULTS: Record<OpeningType, OpeningDefaults> = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
};

/** Absolute Grenzen; zusätzlich begrenzen Wandlänge und Wandhöhe (siehe utils/openings). */
export const OPENING_LIMITS: Record<OpeningType, { width: [Meters, Meters]; height: [Meters, Meters] }> = {
  door: { width: [0.5, 3], height: [1.5, 3] },
  window: { width: [0.3, 5], height: [0.3, 3] },
};

/** Schrittweite der Eingabefelder (↑/↓). */
export const OPENING_INPUT_STEP: Meters = 0.05;

/** Bevorzugte Wand beim Hinzufügen; weitere Wände werden in dieser Reihenfolge probiert. */
export const OPENING_PREFERRED_WALLS: Record<OpeningType, readonly WallSide[]> = {
  door: ['south', 'west', 'east', 'north'],
  window: ['north', 'east', 'west', 'south'],
};

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  door: 'Tür',
  window: 'Fenster',
};

/** 3D-Darstellung der Rahmen und Türblätter. */
export const OPENING_MODEL_CONFIG = {
  frameWidth: 0.05,
  /** Überstand der Türzarge über die Wandflächen je Seite. */
  doorFrameOverhang: 0.01,
  doorLeafThickness: 0.04,
  windowFrameDepth: 0.07,
  glassThickness: 0.01,
} as const;

/** Direktes Verschieben im Grundriss. Pixelwerte werden mit dem aktuellen Zoom umgerechnet. */
export const OPENING_DRAG_CONFIG = {
  /** Bewegung, ab der ein Klick zum Ziehen wird. */
  dragStartTolerancePx: 3,
  /** Einrastabstand (Ecken, Wandmitte, Nachbarelemente) – bewusst klein gehalten. */
  snapDistancePx: 8,
  /** Eine andere Wand übernimmt erst, wenn sie um diesen Betrag näher ist … */
  wallSwitchHysteresisPx: 24,
  wallSwitchHysteresisMinM: 0.1,
  /** … und der Zeiger höchstens so weit von ihr entfernt ist. */
  wallSwitchRadiusPx: 48,
  wallSwitchRadiusMinM: 0.6,
} as const;
