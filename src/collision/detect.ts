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

/** Achsparallele Hülle eines Colliders (Broad Phase). */
function boundsOf(collider: Collider) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of collider.footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { collider, minX, maxX, minZ, maxZ };
}

/**
 * Prüft Collider paarweise gegen die Regeltabelle. Kollision = Grundflächen
 * überschneiden sich (mehr als nur Berühren) UND Höhenbereiche überschneiden sich.
 *
 * Broad Phase: nach x sortiert, nur Paare mit überlappender Hülle werden genau geprüft
 * (Sortieren und Fegen) – bei vielen Möbeln nahezu linear statt quadratisch. Mehrere
 * Zonen desselben Möbelpaars (z. B. Platte und Bein) ergeben EINEN Treffer.
 */
export function detectCollisions(
  colliders: readonly Collider[],
  rules: readonly CollisionRule[] = COLLISION_RULES,
): CollisionReport {
  const tolerance = COLLISION_CONFIG.touchTolerance;
  const hits: CollisionHit[] = [];
  const seen = new Set<string>();
  const boxes = colliders.map(boundsOf).sort((a, b) => a.minX - b.minX);

  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j];
      // Alle weiteren beginnen noch weiter rechts: kein Überlapp mehr möglich.
      if (B.minX - A.maxX >= tolerance) break;
      if (Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ) <= tolerance) continue;
      const a = A.collider;
      const b = B.collider;
      if (sameRef(a.owner, b.owner)) continue;
      const match = matchRule(a, b, rules);
      if (!match) continue;
      // Symmetrische Regeln (Möbel ↔ Möbel): Paar unabhängig von der Reihenfolge der Zonen.
      const owners = [refKey(match.subject.owner), refKey(match.other.owner)];
      const key = `${match.rule.id}|${(match.rule.kinds[0] === match.rule.kinds[1] ? owners.sort() : owners).join('|')}`;
      if (seen.has(key)) continue;
      if (!heightRangesOverlap(a.height, b.height, tolerance)) continue;
      if (!polygonsOverlap(a.footprint, b.footprint, tolerance)) continue;
      seen.add(key);
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

/**
 * Kollidiert eines der `subject`-Collider mit einem der `others` (beliebige Regel)?
 * Schnelle Einzelprüfung, z. B. für die Platzsuche neuer Möbel – ohne vollständigen Bericht.
 */
export function anyConflict(subject: readonly Collider[], others: readonly Collider[], rules: readonly CollisionRule[] = COLLISION_RULES): boolean {
  const tolerance = COLLISION_CONFIG.touchTolerance;
  const boxes = others.map(boundsOf);
  for (const a of subject) {
    const A = boundsOf(a);
    for (const B of boxes) {
      if (Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX) <= tolerance || Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ) <= tolerance) continue;
      if (sameRef(a.owner, B.collider.owner) || !matchRule(a, B.collider, rules)) continue;
      if (heightRangesOverlap(a.height, B.collider.height, tolerance) && polygonsOverlap(a.footprint, B.collider.footprint, tolerance)) return true;
    }
  }
  return false;
}
