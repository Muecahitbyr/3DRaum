import { useEffect, useMemo } from 'react';
import { Float32BufferAttribute } from 'three';
import type { RoomModel } from '../../../utils/room/model';
import { buildFloorGeometry } from './Floor';

const noRaycast = () => {};

/**
 * Decke genau in der Raumkontur (dieselbe Triangulation wie der Boden), nach unten
 * gerichtet: Von innen sichtbar, von oben durchsichtig (Rückseiten werden nicht
 * gezeichnet) – so bleibt der Blick von oben in den Raum frei. Wirft keinen Schatten
 * und nimmt keine Klicks an.
 */
export function Ceiling({ room, color, visible }: { room: RoomModel; color: string; visible: boolean }) {
  const geometry = useMemo(() => {
    const g = buildFloorGeometry(room, room.dimensions.height);
    // Wicklung umdrehen und Normalen nach unten.
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 3) {
      for (const attribute of [pos, uv]) {
        const size = attribute.itemSize;
        const a = Array.from({ length: size }, (_, k) => attribute.getComponent(i + 1, k));
        for (let k = 0; k < size; k++) attribute.setComponent(i + 1, k, attribute.getComponent(i + 2, k));
        for (let k = 0; k < size; k++) attribute.setComponent(i + 2, k, a[k]);
      }
    }
    g.setAttribute('normal', new Float32BufferAttribute(Array.from({ length: pos.count }, () => [0, -1, 0]).flat(), 3));
    return g;
  }, [room]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh name="ceiling" geometry={geometry} visible={visible} raycast={noRaycast} receiveShadow userData={{ color }}>
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}
