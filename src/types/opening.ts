import type { Meters } from './room';

export type OpeningType = 'door' | 'window';

/**
 * Gemeinsame Felder aller Wandöffnungen. Öffnungen werden als flache Liste
 * gespeichert und referenzieren ihre Wand – beliebig viele pro Wand sind möglich.
 */
interface OpeningBase {
  id: string;
  /** ID der Wand, zu der die Öffnung gehört. */
  wall: string;
  /**
   * Abstand vom Wandanfang (Innenecke, in Wandrichtung) bis zur Öffnungskante.
   * Die Oberfläche zeigt ihn in Grundriss-Leserichtung („von links/oben“) an.
   */
  offset: Meters;
  width: Meters;
  height: Meters;
}

/** Anschlag (Seite der Bänder), vom Rauminneren auf die Wand gesehen. */
export type DoorHinge = 'left' | 'right';
/** Öffnungsrichtung des Türblatts. */
export type DoorSwing = 'inward' | 'outward';

export interface DoorOpening extends OpeningBase {
  type: 'door';
  hinge: DoorHinge;
  swing: DoorSwing;
}

export interface WindowOpening extends OpeningBase {
  type: 'window';
  /** Brüstungshöhe: Abstand vom Boden bis zur Unterkante des Fensters. */
  sillHeight: Meters;
  /** Einflügelig (1) oder zweiflügelig (2). */
  sashes: 1 | 2;
}

export type Opening = DoorOpening | WindowOpening;

/** Bearbeitbare Felder (Typ und ID sind fix). */
export type OpeningPatch = Partial<Omit<DoorOpening, 'id' | 'type'>> &
  Partial<Omit<WindowOpening, 'id' | 'type'>>;
