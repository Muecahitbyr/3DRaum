import type { FloorPoint, Meters } from '../types/room';

/** Verweis auf ein Planungsobjekt. Neue Objektarten werden hier ergänzt. */
export type ObjectRef =
  | { type: 'furniture'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'fixture'; id: string }
  | { type: 'wall'; id: string };

/**
 * Art eines Kollisionskörpers. Ein Objekt kann mehrere haben (eine Tür z. B.
 * ihre Lage in der Wand und ihren Schwenkbereich).
 */
export type ColliderKind = 'furniture' | 'openingSpan' | 'doorSwing' | 'windowZone' | 'radiator' | 'wall';

/** Konvexes Polygon im Grundriss (Weltkoordinaten x/z). */
export type Polygon = readonly FloorPoint[];

export interface HeightRange {
  min: Meters;
  max: Meters;
}

export interface Collider {
  kind: ColliderKind;
  owner: ObjectRef;
  footprint: Polygon;
  /** Höhenbereich; Kollision nur, wenn sich auch diese Bereiche überschneiden. */
  height: HeightRange;
}

export type CollisionSeverity = 'error' | 'warning';

export type CollisionRuleId =
  | 'furniture-overlap'
  | 'door-swing'
  | 'window-blocked'
  | 'opening-overlap'
  | 'radiator-covered'
  | 'radiator-door-swing'
  | 'furniture-wall';

export interface CollisionHit {
  rule: CollisionRuleId;
  severity: CollisionSeverity;
  /** Objekt der ersten Collider-Art der Regel (z. B. das Möbel) … */
  subject: ObjectRef;
  /** … und das andere beteiligte Objekt. */
  other: ObjectRef;
}

export interface CollisionReport {
  hits: readonly CollisionHit[];
  /** Alle Treffer, an denen ein Objekt beteiligt ist (Schlüssel: `refKey`). */
  byObject: ReadonlyMap<string, readonly CollisionHit[]>;
  /** Höchster Schweregrad je Objekt (Schlüssel: Objekt-ID). */
  severityById: ReadonlyMap<string, CollisionSeverity>;
}

export const refKey = (ref: ObjectRef) => `${ref.type}:${ref.id}`;
export const sameRef = (a: ObjectRef, b: ObjectRef) => a.type === b.type && a.id === b.id;
