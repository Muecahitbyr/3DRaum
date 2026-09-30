import type { Meters } from '../types/room';

export const COLLISION_CONFIG = {
  /**
   * Mindest-Eindringtiefe für eine Kollision. Nur berührende Kanten (Abstand 0)
   * gelten nicht als Überschneidung; 0,1 mm fängt Gleitkomma-Rauschen ab.
   */
  touchTolerance: 1e-4 as Meters,
  /** Segmente, mit denen der Viertelkreis des Tür-Schwenkbereichs angenähert wird. */
  doorSwingSegments: 16,
  /** Tiefe der Zone vor einem Fenster, in der Möbel das Fenster verdecken können. */
  windowClearanceDepth: 0.4 as Meters,
} as const;
