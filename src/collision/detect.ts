import { COLLISION_CONFIG } from '../config/collision';
import { heightRangesOverlap, polygonsOverlap } from './geometry';
import { COLLISION_RULES, type CollisionRule } from './rules';
import { refKey, sameRef, type Collider, type CollisionHit, type CollisionReport, type CollisionSeverity } from './types';

const SEVERITY_RANK: Record<CollisionSeverity, number> = { warning: 1, error: 2 };

/** Passende Regel für zwei Collider; liefert sie in Regel-Reihenfolge (Subjekt zuerst). */
function matchRule(a: Collider, b: Collider, rules: readonly CollisionRule[]) {
  for (const rule of rules) {
    if (rule.kinds[0] === a.kind && rule.kinds[1] === b.kind) return { rule, subject: a, other: b };
    if (rule.kinds[0] === b.kind && rule.kinds[1] === a.kind) return { rule, subject: b, other: a };
  }
  return null;
}

/**
 * Prüft alle Collider paarweise gegen die Regeltabelle. Kollision = Grundflächen
 * überschneiden sich (mehr als nur Berühren) UND Höhenbereiche überschneiden sich.
 */
export function detectCollisions(
  colliders: readonly Collider[],
  rules: readonly CollisionRule[] = COLLISION_RULES,
): CollisionReport {
  const tolerance = COLLISION_CONFIG.touchTolerance;
  const hits: CollisionHit[] = [];

  for (let i = 0; i < colliders.length; i++) {
    for (let j = i + 1; j < colliders.length; j++) {
      const a = colliders[i];
      const b = colliders[j];
      if (sameRef(a.owner, b.owner)) continue;
      const match = matchRule(a, b, rules);
      if (!match) continue;
      if (!heightRangesOverlap(a.height, b.height, tolerance)) continue;
      if (!polygonsOverlap(a.footprint, b.footprint, tolerance)) continue;
      hits.push({ rule: match.rule.id, severity: match.rule.severity, subject: match.subject.owner, other: match.other.owner });
    }
  }

  const byObject = new Map<string, CollisionHit[]>();
  const severityById = new Map<string, CollisionSeverity>();
  for (const hit of hits) {
    for (const ref of [hit.subject, hit.other]) {
      const key = refKey(ref);
      byObject.set(key, [...(byObject.get(key) ?? []), hit]);
      const current = severityById.get(ref.id);
      if (!current || SEVERITY_RANK[hit.severity] > SEVERITY_RANK[current]) severityById.set(ref.id, hit.severity);
    }
  }
  return { hits, byObject, severityById };
}
