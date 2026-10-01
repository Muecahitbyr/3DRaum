import type { ColliderKind, CollisionRuleId, CollisionSeverity } from './types';

export interface CollisionRule {
  id: CollisionRuleId;
  /** Collider-Arten, die gegeneinander geprüft werden; die erste Art ist das „Subjekt“. */
  kinds: readonly [ColliderKind, ColliderKind];
  severity: CollisionSeverity;
  /** Warntexte aus Sicht des Subjekts bzw. des anderen Objekts (`names` = Namen der Gegenüber). */
  messages: {
    subject: (names: string) => string;
    other: (names: string) => string;
  };
}

/**
 * Zentrale Regeltabelle: Welche Collider-Arten dürfen sich nicht überschneiden,
 * wie schwer wiegt es und was wird angezeigt. Neue Objektarten = neue Einträge.
 */
export const COLLISION_RULES: readonly CollisionRule[] = [
  {
    id: 'furniture-overlap',
    kinds: ['furniture', 'furniture'],
    severity: 'error',
    messages: {
      subject: (names) => `Dieses Möbel überschneidet sich mit ${names}.`,
      other: (names) => `Dieses Möbel überschneidet sich mit ${names}.`,
    },
  },
  {
    id: 'door-swing',
    kinds: ['furniture', 'doorSwing'],
    severity: 'error',
    messages: {
      subject: (names) => `Dieses Möbel steht im Schwenkbereich von ${names}.`,
      other: (names) => `Der Schwenkbereich der Tür wird durch ${names} blockiert.`,
    },
  },
  {
    id: 'window-blocked',
    kinds: ['furniture', 'windowZone'],
    severity: 'warning',
    messages: {
      subject: (names) => `Dieses Möbel verdeckt ${names} – es ist höher als die Brüstung.`,
      other: (names) => `Das Fenster wird durch ${names} verdeckt.`,
    },
  },
  {
    // Ganze Hülle des Möbels: Auch eine Tischplatte über dem Heizkörper staut die Wärme.
    id: 'radiator-covered',
    kinds: ['furnitureEnvelope', 'radiator'],
    severity: 'error',
    messages: {
      subject: (names) => `Dieses Möbel überschneidet sich mit ${names}.`,
      other: (names) => `Der Heizkörper wird durch ${names} verdeckt.`,
    },
  },
  {
    id: 'radiator-door-swing',
    kinds: ['radiator', 'doorSwing'],
    severity: 'error',
    messages: {
      subject: (names) => `Der Heizkörper liegt im Schwenkbereich von ${names}.`,
      other: (names) => `Der Schwenkbereich der Tür wird durch ${names} blockiert.`,
    },
  },
  {
    id: 'furniture-wall',
    kinds: ['furniture', 'wall'],
    severity: 'error',
    messages: {
      subject: (names) => `Dieses Möbel ragt in ${names}.`,
      other: (names) => `${names} ragt in diese Wand.`,
    },
  },
  {
    id: 'opening-overlap',
    kinds: ['openingSpan', 'openingSpan'],
    severity: 'error',
    messages: {
      subject: () => 'Überschneidet sich mit einem anderen Element an dieser Wand.',
      other: () => 'Überschneidet sich mit einem anderen Element an dieser Wand.',
    },
  },
];

export const RULES_BY_ID = new Map(COLLISION_RULES.map((rule) => [rule.id, rule]));
