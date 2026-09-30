import { ROOM_EDITOR_CONFIG } from '../../config/room';
import type { FloorPoint } from '../../types/room';
import { roundToPrecision } from '../units';
import type { RoomModel } from './model';

export interface CornerSnapGuide {
  axis: 'x' | 'z' | 'angle';
  /** Grundriss: Linie von → bis. */
  from: FloorPoint;
  to: FloorPoint;
}

/**
 * Einrasten beim Verschieben einer Ecke (Grundrisskoordinaten):
 * 1. x bzw. z einer anderen Ecke (waagerecht/senkrecht fluchten – ergibt an den
 *    Nachbarecken rechte Winkel und achsparallele Wände),
 * 2. sonst Wandrichtung zu einer Nachbarecke nahe 0°/45°/90°,
 * danach Rundung auf ganze Zentimeter. Abstände in Bildschirmpixeln (zoomunabhängig).
 */
export function snapCorner(room: RoomModel, wallId: string, desired: FloorPoint, metersPerPixel: number) {
  const index = room.walls.findIndex((w) => w.id === wallId);
  const corners = room.polygon;
  const n = corners.length;
  const others = corners.filter((_, i) => i !== index);
  const distance = ROOM_EDITOR_CONFIG.snapDistancePx * metersPerPixel;
  const guides: CornerSnapGuide[] = [];

  const nearestAxis = (axis: 'x' | 'z') => {
    let best: FloorPoint | null = null;
    for (const c of others) {
      const d = Math.abs(c[axis] - desired[axis]);
      if (d <= distance && (!best || d < Math.abs(best[axis] - desired[axis]))) best = c;
    }
    return best;
  };
  const sx = nearestAxis('x');
  const sz = nearestAxis('z');
  let point = { x: sx ? sx.x : desired.x, z: sz ? sz.z : desired.z };
  if (sx) guides.push({ axis: 'x', from: sx, to: point });
  if (sz) guides.push({ axis: 'z', from: sz, to: point });

  if (!sx && !sz && index >= 0) {
    // Winkel zu den Nachbarecken (0/45/90/135 …): auf den nächsten Strahl projizieren.
    const neighbors = [corners[(index - 1 + n) % n], corners[(index + 1) % n]];
    let best: { point: FloorPoint; error: number; from: FloorPoint } | null = null;
    for (const nb of neighbors) {
      const dx = desired.x - nb.x;
      const dz = desired.z - nb.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const angle = (Math.atan2(dz, dx) * 180) / Math.PI;
      const snapped = Math.round(angle / 45) * 45;
      const error = Math.abs(angle - snapped);
      if (error > ROOM_EDITOR_CONFIG.angleSnapDeg) continue;
      const rad = (snapped * Math.PI) / 180;
      const projected = { x: nb.x + Math.cos(rad) * len, z: nb.z + Math.sin(rad) * len };
      if (Math.hypot(projected.x - desired.x, projected.z - desired.z) > distance * 2) continue;
      if (!best || error < best.error) best = { point: projected, error, from: nb };
    }
    if (best) {
      point = best.point;
      guides.push({ axis: 'angle', from: best.from, to: point });
    }
  }
  return { point: { x: roundToPrecision(point.x), z: roundToPrecision(point.z) }, guides };
}
