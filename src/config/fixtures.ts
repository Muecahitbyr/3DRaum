import type { FixtureType } from '../types/fixture';
import type { Meters, WallSide } from '../types/room';

type Range = [min: Meters, max: Meters];

export interface FixtureDefinition {
  type: FixtureType;
  label: string;
  defaults: { width: Meters; height: Meters; depth: Meters; elevation: Meters };
  /** `null` = feste Größe (nicht bearbeitbar). */
  limits: { width: Range | null; height: Range | null; depth: Range | null; elevation: Range };
  /**
   * `bottom`: Höhe = Abstand der Unterkante zum Boden (Heizkörper).
   * `center`: Höhe = Montagehöhe der Mitte (Steckdose, Schalter – übliche Angabe).
   */
  heightReference: 'bottom' | 'center';
  /** Nimmt an der Möbel-Kollisionsprüfung teil. */
  collides: boolean;
  preferredWalls: readonly WallSide[];
}

export const FIXTURE_CATALOG: Record<FixtureType, FixtureDefinition> = {
  radiator: {
    type: 'radiator',
    label: 'Heizkörper',
    defaults: { width: 1, height: 0.6, depth: 0.1, elevation: 0.1 },
    limits: { width: [0.3, 3], height: [0.2, 1.2], depth: [0.05, 0.25], elevation: [0, 1.5] },
    heightReference: 'bottom',
    collides: true,
    preferredWalls: ['north', 'east', 'west', 'south'],
  },
  socket: {
    type: 'socket',
    label: 'Steckdose',
    defaults: { width: 0.08, height: 0.08, depth: 0.012, elevation: 0.26 },
    limits: { width: null, height: null, depth: null, elevation: [0.1, 2.2] },
    heightReference: 'center',
    collides: false,
    preferredWalls: ['east', 'south', 'west', 'north'],
  },
  switch: {
    type: 'switch',
    label: 'Lichtschalter',
    defaults: { width: 0.08, height: 0.08, depth: 0.012, elevation: 1.01 },
    limits: { width: null, height: null, depth: null, elevation: [0.5, 2] },
    heightReference: 'center',
    collides: false,
    preferredWalls: ['south', 'west', 'east', 'north'],
  },
};

export const FIXTURE_TYPES = Object.keys(FIXTURE_CATALOG) as FixtureType[];

export const FIXTURE_COLORS = {
  radiator: '#f3f3f0',
  radiatorRib: '#e3e3de',
  plate: '#f7f7f5',
  detail: '#8b9098',
} as const;
