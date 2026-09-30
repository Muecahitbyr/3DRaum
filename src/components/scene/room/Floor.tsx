import { useEffect, useLayoutEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { FLOOR_MATERIALS, PLAN_DESIGN_CONFIG } from '../../../config/design';
import type { FloorMaterialId } from '../../../types/design';
import type { RoomModel } from '../../../utils/room/model';
import { getFloorTextures } from '../materials/floorTextures';
import type { RoomVariant } from './Room';

/** Das Orientierungsraster liegt bei y = 0,002 m. */
const FLOOR_ABOVE_GRID = 0.004;

interface FloorProps {
  room: RoomModel;
  material: FloorMaterialId;
  variant: RoomVariant;
}

/**
 * Bodenfläche genau im Raumumriss (auch L- und freie Formen – ausgesparte Bereiche
 * bleiben frei). Triangulation mit Three.js (Ear Clipping). UV in Metern ab der
 * Umriss-Ecke links unten (Grundriss), damit das Muster wie bisher im echten Maßstab liegt.
 */
export function buildFloorGeometry(room: RoomModel, y = 0): BufferGeometry {
  const points = room.worldPolygon;
  const minX = Math.min(...points.map((p) => p.x));
  const maxZ = Math.max(...points.map((p) => p.z));
  const contour = points.map((p) => new Vector2(p.x, p.z));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  for (const [a, b, c] of triangles) {
    // Nach oben zeigende Dreiecke (+y): in x/z gegen den Uhrzeigersinn von oben gesehen.
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    const crossY = (pb.z - pa.z) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.z - pa.z);
    const ordered = crossY >= 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const p of ordered) {
      positions.push(p.x, y, p.z);
      normals.push(0, 1, 0);
      uvs.push(p.x - minX, maxZ - p.z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Boden mit prozeduraler Textur im echten Maßstab (Muster beginnt in der
 * Raumecke). 3D: beleuchtet mit Relief. Grundriss: unbeleuchtet und stark
 * aufgehellt, damit der Plan gut lesbar bleibt.
 */
export function Floor({ room, material, variant }: FloorProps) {
  const { map, bump } = useMemo(() => getFloorTextures(material), [material]);
  const definition = FLOOR_MATERIALS[material];
  const geometry = useMemo(() => buildFloorGeometry(room), [room]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // UV in Metern → eine Wiederholung je `repeatSize`.
  useLayoutEffect(() => {
    for (const texture of [map, bump]) {
      texture.repeat.set(1 / definition.repeatSize, 1 / definition.repeatSize);
      texture.offset.set(0, 0);
    }
  }, [map, bump, definition.repeatSize]);

  const isPlan = variant === 'plan';
  // Beide Varianten bleiben dauerhaft bestehen; umgeschaltet wird nur die Sichtbarkeit.
  // So entstehen beim 2D/3D-Wechsel keine neuen Materialien – die Zeichenreihenfolge
  // (und damit das Bild) bleibt exakt gleich. Name „floor“ trägt der sichtbare Boden.
  return (
    <>
      <mesh
        name={isPlan ? 'floor-model' : 'floor'}
        userData={{ materialId: material }}
        visible={!isPlan}
        geometry={geometry}
        // Knapp über dem Orientierungsraster, damit es den Belag nicht überzeichnet.
        position-y={FLOOR_ABOVE_GRID}
        receiveShadow
      >
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={definition.bumpScale} roughness={definition.roughness} />
      </mesh>
      {/* Grundriss: unbeleuchtet auf Bodenhöhe – das Raster bleibt als Maßhilfe sichtbar. */}
      <mesh name={isPlan ? 'floor' : 'floor-plan'} userData={{ materialId: material }} visible={isPlan} geometry={geometry}>
        <meshBasicMaterial map={map} />
      </mesh>
      {isPlan && (
        <mesh name="floor-plan-veil" position-y={0.001} geometry={geometry}>
          <meshBasicMaterial color="#ffffff" transparent opacity={PLAN_DESIGN_CONFIG.floorVeilOpacity} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
