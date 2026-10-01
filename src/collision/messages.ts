import { RULES_BY_ID } from './rules';
import { refKey, sameRef, type CollisionReport, type CollisionRuleId, type CollisionSeverity, type ObjectRef } from './types';

export interface CollisionMessage {
  rule: CollisionRuleId;
  severity: CollisionSeverity;
  text: string;
}

/** „A“, „A und B“, „A, B und C“ */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

/** Warntexte für ein Objekt – eine Meldung je Regel, Gegenüber zusammengefasst. */
export function describeCollisions(
  ref: ObjectRef,
  report: CollisionReport,
  nameOf: (ref: ObjectRef) => string,
): CollisionMessage[] {
  const grouped = new Map<string, { rule: CollisionRuleId; asSubject: boolean; names: string[] }>();
  for (const hit of report.byObject.get(refKey(ref)) ?? []) {
    // Symmetrische Regeln (Möbel ↔ Möbel, Öffnung ↔ Öffnung): Die Rolle ist bedeutungslos –
    // alle Gegenüber in EINER Meldung („… mit Sofa 1 und Kleiderschrank 1.“).
    const symmetric = RULES_BY_ID.get(hit.rule)!.kinds[0] === RULES_BY_ID.get(hit.rule)!.kinds[1];
    const isSubject = sameRef(hit.subject, ref);
    const counterpart = isSubject ? hit.other : hit.subject;
    const asSubject = symmetric || isSubject;
    const key = `${hit.rule}:${asSubject}`;
    const entry = grouped.get(key) ?? { rule: hit.rule, asSubject, names: [] };
    const name = nameOf(counterpart);
    if (!entry.names.includes(name)) entry.names.push(name);
    grouped.set(key, entry);
  }
  return [...grouped.values()].map(({ rule, asSubject, names }) => {
    const definition = RULES_BY_ID.get(rule)!;
    const text = (asSubject ? definition.messages.subject : definition.messages.other)(joinNames(names));
    return { rule, severity: definition.severity, text };
  });
}
