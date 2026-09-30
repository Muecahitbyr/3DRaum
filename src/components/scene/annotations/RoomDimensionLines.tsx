import { useMemo } from 'react';
import { createWallDimensions } from '../../../utils/room/dimensions';
import type { RoomModel } from '../../../utils/room/model';
import { DimensionLine } from './DimensionLine';

interface RoomDimensionLinesProps {
  room: RoomModel;
  metersPerPixel: number;
}

/** Jede Wand mit ihrer tatsächlichen Länge – auch bei L- und freien Formen. */
export function RoomDimensionLines({ room, metersPerPixel }: RoomDimensionLinesProps) {
  const wallDimensions = useMemo(() => createWallDimensions(room), [room]);
  // Knapp über den Wandoberkanten, damit Hilfslinien nicht verdeckt werden.
  const elevation = room.dimensions.height + 0.05;

  return (
    <group name="room-dimensions">
      {wallDimensions.map((dimension) => (
        <DimensionLine key={dimension.id} dimension={dimension} elevation={elevation} metersPerPixel={metersPerPixel} />
      ))}
    </group>
  );
}
