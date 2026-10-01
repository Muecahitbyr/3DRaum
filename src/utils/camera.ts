import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_CONFIG, PLAN_VIEW_CONFIG } from '../config/scene';
import type { FloorPoint, Meters } from '../types/room';
import type { Bounds } from './polygon';

/** Was eingepasst wird: Außenumriss (Welt, inkl. Wandstärken) und Höhe. */
export interface FitShape {
  outline: readonly FloorPoint[];
  bounds: Bounds;
  height: Meters;
}

/** Einzupassender Umriss eines Raums (Welt). */
export const fitShapeOf = (room: { outerPolygon: FloorPoint[]; outerBounds: Bounds; dimensions: { height: Meters } }): FitShape => ({
  outline: room.outerPolygon,
  bounds: room.outerBounds,
  height: room.dimensions.height,
});

/** Mittelpunkt der Hülle (Welt) – Drehzentrum bzw. Blickziel. */
export const fitCenter = ({ bounds }: FitShape): FloorPoint => ({ x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 });

/**
 * Berechnet die Startposition der 3D-Kamera: Blick schräg von oben in den Raum,
 * so nah wie möglich, aber mit allen Außenecken der Wände im Bild – unabhängig
 * vom Seitenverhältnis. Eingepasst wird über die projizierten Eckpunkte
 * (genauer als eine umschließende Kugel, dadurch wirkt der Raum größer).
 */
export function computeFitCameraPosition(shape: FitShape, aspect: number, target: Vector3): Vector3 {
  const direction = new Vector3(...CAMERA_CONFIG.viewDirection).normalize();
  const camera = new PerspectiveCamera(CAMERA_CONFIG.fov, aspect, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
  const corners = [0, shape.height].flatMap((y) => shape.outline.map((p) => new Vector3(p.x, y, p.z)));
  const limit = 1 / CAMERA_CONFIG.fitMargin;
  const projected = new Vector3();

  const fits = (distance: number) => {
    camera.position.copy(direction).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return corners.every((corner) => {
      projected.copy(corner).project(camera);
      return projected.z < 1 && Math.abs(projected.x) <= limit && Math.abs(projected.y) <= limit;
    });
  };

  // Kleinster Abstand, bei dem alles im Bild ist (Bisektion; „passt“ ist monoton im Abstand).
  let near = 0.5;
  let far = 500;
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return direction.multiplyScalar(far).add(target);
}

/**
 * Zoom (Pixel pro Meter) für die orthografische Draufsicht, sodass der Raum
 * inkl. Wände und Maßlinien vollständig in die Arbeitsfläche passt.
 */
export function computePlanFitZoom({ bounds }: FitShape, viewportWidth: number, viewportHeight: number, extraPaddingPx = 0): number {
  // Rand für Maßlinien und Werkzeugleisten; auf kleinen Bildschirmen schmaler (Desktop: 112 px).
  // `extraPaddingPx`: zusätzliche Maßebenen (Öffnungsmaßkette schiebt das Gesamtmaß nach außen).
  const padX = Math.min(PLAN_VIEW_CONFIG.fitPaddingPx, Math.max(40, viewportWidth * 0.12)) + extraPaddingPx;
  const padY = Math.min(PLAN_VIEW_CONFIG.fitPaddingPx, Math.max(96, viewportHeight * 0.125)) + extraPaddingPx;
  const availableWidth = Math.max(viewportWidth - 2 * padX, 1);
  const availableHeight = Math.max(viewportHeight - 2 * padY, 1);
  const zoom = Math.min(availableWidth / (bounds.maxX - bounds.minX), availableHeight / (bounds.maxZ - bounds.minZ));
  return MathUtils.clamp(zoom, PLAN_VIEW_CONFIG.minZoom, PLAN_VIEW_CONFIG.maxZoom);
}
