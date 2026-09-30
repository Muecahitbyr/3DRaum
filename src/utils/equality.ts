/** Flacher Vergleich inkl. einer Ebene verschachtelter Objekte (z. B. `position`). */
export function sameValues(a: object, b: object): boolean {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) {
    const va = ra[key];
    const vb = rb[key];
    if (va === vb) continue;
    if (typeof va === 'object' && va && typeof vb === 'object' && vb && sameValues(va, vb)) continue;
    return false;
  }
  return true;
}

/** Gleiche Elemente in gleicher Reihenfolge (nach Werten). */
export function sameItems<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, i) => item === b[i] || sameValues(item, b[i])));
}
