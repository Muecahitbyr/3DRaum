import type { FurnitureColorSlot, FurnitureSize, LampLight } from '../../../../types/furniture';

/**
 * Prozedurale Modelle erhalten ihre Außenmaße. Ursprung: Mitte der Grundfläche
 * auf Bodenhöhe; Breite = x, Tiefe = z (Vorderseite +z), Höhe = y.
 * `colors`: nur abweichende Farben – fehlt ein Bereich, gelten die bisherigen Modellfarben.
 */
export interface FurnitureModelProps extends FurnitureSize {
  colors?: Partial<Record<FurnitureColorSlot, string>>;
  /** Lampen: Licht (für leuchtenden Schirm). */
  light?: LampLight;
}
