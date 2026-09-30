import type { Meters } from './room';

/** Feste, wandgebundene Raumobjekte. Neue Arten: hier ergänzen + Katalog + Darstellung. */
export type FixtureType = 'radiator' | 'socket' | 'switch';

/**
 * Wandgebundenes Raumobjekt. Position wie bei Öffnungen: Wand-ID und Abstand vom
 * Wandanfang bis zur Objektkante.
 * Das Objekt sitzt vor der Wand-Innenfläche und ragt `depth` in den Raum.
 */
export interface RoomFixture {
  id: string;
  type: FixtureType;
  wall: string;
  offset: Meters;
  width: Meters;
  height: Meters;
  depth: Meters;
  /** Abstand der Unterkante zum Boden. */
  elevation: Meters;
}

export type FixturePatch = Partial<Omit<RoomFixture, 'id' | 'type'>>;
