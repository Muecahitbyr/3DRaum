import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { SCENE_COLORS } from '../../../config/scene';
import type { FurnitureItem } from '../../../types/furniture';
import type { RoomModel } from '../../../utils/room/model';
import { formationBounds } from '../../../utils/furnitureFormation';

/** Über Möbelsymbolen und ausgewähltem Möbel, unter den Abstandsmaßen. */
const Y = 0.035;
const PADDING = 0.05;

/** Gestrichelter Rahmen um eine Mehrfachauswahl im Grundriss (tatsächliche, gedrehte Grundflächen). */
export function SelectionBounds({
  items,
  room,
  metersPerPixel,
}: {
  items: readonly FurnitureItem[];
  room: RoomModel;
  metersPerPixel: number;
}) {
  const points = useMemo(() => {
    const b = formationBounds(items);
    const x0 = b.x0 - PADDING - room.origin.x;
    const x1 = b.x1 + PADDING - room.origin.x;
    const z0 = b.z0 - PADDING - room.origin.z;
    const z1 = b.z1 + PADDING - room.origin.z;
    return [
      [x0, Y, z0],
      [x1, Y, z0],
      [x1, Y, z1],
      [x0, Y, z1],
      [x0, Y, z0],
    ] as [number, number, number][];
  }, [items, room]);

  return (
    <Line
      name="selection-bounds"
      userData={{ count: items.length }}
      points={points}
      color={SCENE_COLORS.selection}
      lineWidth={1.25}
      dashed
      dashSize={6}
      gapSize={4}
      dashScale={1 / metersPerPixel}
    />
  );
}
