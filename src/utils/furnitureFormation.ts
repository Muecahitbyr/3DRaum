import type { FurnitureItem } from '../types/furniture';
import type { FloorPoint } from '../types/room';
import { getFootprintHalfExtents } from './furniture';
import { maxFormationStep } from './room/containment';
import type { RoomModel } from './room/model';
import { roundToPrecision } from './units';

type FormationItem = Pick<FurnitureItem, 'id' | 'width' | 'depth' | 'rotationDeg' | 'position'>;

const roundPoint = (p: FloorPoint): FloorPoint => ({ x: roundToPrecision(p.x), z: roundToPrecision(p.z) });

/**
 * Mehrere Möbel als starre Formation: gemeinsame Verschiebung so begrenzen, dass
 * JEDES Möbel in der tatsächlichen Raumkontur bleibt – die Anordnung zueinander
 * bleibt dabei erhalten. Ist der volle Weg blockiert, wird achsweise so weit wie
 * möglich geschoben (erst x, dann z bzw. umgekehrt – der weitere Weg gewinnt).
 * Bei Rechteckräumen entspricht das dem bisherigen achsweisen Begrenzen.
 */
export function clampFormationDelta(items: readonly FormationItem[], delta: FloorPoint, room: RoomModel): FloorPoint {
  const d = roundPoint(delta);
  if (d.x === 0 && d.z === 0) return d;
  const zero = { x: 0, z: 0 };
  if (maxFormationStep(room, items, zero, d) === 1) return d;

  const slide = (first: 'x' | 'z') => {
    const second = first === 'x' ? 'z' : 'x';
    const a = { ...zero, [first]: d[first] } as FloorPoint;
    const sa = roundPoint({ x: a.x * maxFormationStep(room, items, zero, a), z: a.z * maxFormationStep(room, items, zero, a) });
    const b = { ...zero, [second]: d[second] } as FloorPoint;
    const fb = maxFormationStep(room, items, sa, b);
    return roundPoint({ x: sa.x + b.x * fb, z: sa.z + b.z * fb });
  };
  const xz = slide('x');
  const zx = slide('z');
  const travel = (p: FloorPoint) => Math.abs(p.x) + Math.abs(p.z);
  return travel(zx) > travel(xz) + 1e-9 ? zx : xz;
}

/** Neue Positionen nach gemeinsamer (begrenzter) Verschiebung. */
export function moveFormation(items: readonly FormationItem[], delta: FloorPoint, room: RoomModel): Record<string, FloorPoint> {
  const d = clampFormationDelta(items, delta, room);
  return Object.fromEntries(
    items.map((item) => [item.id, { x: roundToPrecision(item.position.x + d.x), z: roundToPrecision(item.position.z + d.z) }]),
  );
}

/** Umschließendes Rechteck der tatsächlichen (gedrehten) Grundflächen. */
export function formationBounds(items: readonly Pick<FurnitureItem, 'width' | 'depth' | 'rotationDeg' | 'position'>[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const item of items) {
    const { hx, hz } = getFootprintHalfExtents(item);
    x0 = Math.min(x0, item.position.x - hx);
    x1 = Math.max(x1, item.position.x + hx);
    z0 = Math.min(z0, item.position.z - hz);
    z1 = Math.max(z1, item.position.z + hz);
  }
  return { x0, x1, z0, z1 };
}

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-z' | 'bottom' | 'center';

/**
 * Gewünschte Verschiebung zum Ausrichten. Links/rechts/oben/unten: in diese Richtung
 * bis zur Wand schieben (die Begrenzung übernimmt `clampFormationDelta` – so
 * funktioniert es auch in L-Formen und bei schrägen Wänden). Mitte: zur Mitte der
 * Umriss-Hülle.
 */
export function alignmentDelta(items: readonly FormationItem[], mode: AlignMode, room: RoomModel): FloorPoint {
  const b = formationBounds(items);
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const far = { x: maxX - minX, z: maxZ - minZ };
  const cx = (minX + maxX) / 2 - (b.x0 + b.x1) / 2;
  const cz = (minZ + maxZ) / 2 - (b.z0 + b.z1) / 2;
  switch (mode) {
    case 'left':
      return { x: -far.x, z: 0 };
    case 'right':
      return { x: far.x, z: 0 };
    case 'top':
      return { x: 0, z: -far.z };
    case 'bottom':
      return { x: 0, z: far.z };
    case 'center-x':
      return { x: cx, z: 0 };
    case 'center-z':
      return { x: 0, z: cz };
    case 'center':
      return { x: cx, z: cz };
  }
}

/** „Stuhl 1“ → „Stuhl 2“ (nächste freie Nummer); „Couch“ → „Couch 2“. */
export function nextCopyName(name: string, existingNames: readonly string[]): string {
  const match = /^(.*\S)\s+(\d+)$/.exec(name.trim());
  const base = match ? match[1] : name.trim();
  let highest = 1;
  for (const existing of existingNames) {
    if (existing.trim() === base) continue;
    const m = /^(.*\S)\s+(\d+)$/.exec(existing.trim());
    if (m && m[1] === base) highest = Math.max(highest, Number(m[2]));
  }
  return `${base} ${highest + 1}`;
}
