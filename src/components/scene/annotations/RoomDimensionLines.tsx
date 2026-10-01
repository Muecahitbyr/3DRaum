import { memo, useMemo } from 'react';
import { DIMENSION_CONFIG } from '../../../config/scene';
import type { Opening } from '../../../types/opening';
import { createWallDimensions } from '../../../utils/room/dimensions';
import { layoutRoomDimensions, type DimensionLayoutOptions } from '../../../utils/room/dimensionLayout';
import { openingChain, toReadingChain } from '../../../utils/room/measurements';
import type { RoomModel } from '../../../utils/room/model';
import { formatMeters } from '../../../utils/units';
import { DimensionChain } from './DimensionChain';
import { DimensionLine } from './DimensionLine';

interface RoomDimensionLinesProps {
  room: RoomModel;
  /** Türen, Fenster und Durchgänge: Wände mit Öffnungen erhalten eine Maßkette. */
  openings: readonly Opening[];
  metersPerPixel: number;
}

/** Bildschirmmaße der Beschriftungen (Schätzung aus Schriftgröße und Zeichenzahl, Pixel). */
const LABEL_METRICS: Omit<DimensionLayoutOptions, 'pxPerMeter'> = {
  offsets: {
    overall: DIMENSION_CONFIG.offsetPx,
    overallWithChain: DIMENSION_CONFIG.chainOverallOffsetPx,
    chain: DIMENSION_CONFIG.chainOffsetPx,
    lane: DIMENSION_CONFIG.chainLanePx,
  },
  gap: DIMENSION_CONFIG.chainLabelGapPx,
  overallText: (length) => `${formatMeters(length)} m`,
  chainText: (length) => formatMeters(length),
  // Gesamtmaß: 12 px, halbfett, Pille mit Rand; Kette: 11 px ohne Rahmen.
  overallSize: (text) => ({ w: text.length * 7.2 + 16, h: 20 }),
  chainSize: (text) => ({ w: text.length * DIMENSION_CONFIG.chainCharPx + DIMENSION_CONFIG.chainLabelPaddingPx, h: 15 }),
};

/**
 * Jede Wand mit ihrer tatsächlichen Länge – auch bei L- und freien Formen. Wände mit
 * Öffnungen bekommen nah an der Wand eine Öffnungsmaßkette; ihr Gesamtmaß rückt dann
 * eine Ebene nach außen. Alle Beschriftungen werden gemeinsam platziert (keine Überdeckung,
 * auch nicht zwischen den Maßen benachbarter Wände an Innenecken).
 *
 * Memoisiert: Jede Beschriftung ist ein eigenes HTML-Overlay (eigene React-Wurzel). Beim Ziehen
 * von Möbeln ändern sich Raum, Öffnungen und Zoom nicht – dann rendert hier nichts neu.
 */
export const RoomDimensionLines = memo(function RoomDimensionLines({ room, openings, metersPerPixel }: RoomDimensionLinesProps) {
  const wallDimensions = useMemo(() => createWallDimensions(room), [room]);
  const chains = useMemo(
    () =>
      room.walls.map((wall) => {
        const spans = openings.filter((o) => o.wall === wall.id);
        return spans.length ? toReadingChain(wall, openingChain(wall.length, spans)) : null;
      }),
    [room, openings],
  );
  const layout = useMemo(
    () => layoutRoomDimensions(wallDimensions, chains, { ...LABEL_METRICS, pxPerMeter: 1 / metersPerPixel }),
    [wallDimensions, chains, metersPerPixel],
  );
  // Knapp über den Wandoberkanten, damit Hilfslinien nicht verdeckt werden.
  const elevation = room.dimensions.height + 0.05;

  return (
    <group name="room-dimensions">
      {wallDimensions.map((dimension, i) => {
        const chain = chains[i];
        return (
          <group key={dimension.id}>
            {chain && (
              <DimensionChain
                dimension={dimension}
                wallId={room.walls[i].id}
                segments={chain}
                labels={layout[i].chain}
                elevation={elevation}
                metersPerPixel={metersPerPixel}
              />
            )}
            <DimensionLine
              dimension={dimension}
              elevation={elevation}
              metersPerPixel={metersPerPixel}
              offsetPx={chain ? DIMENSION_CONFIG.chainOverallOffsetPx : DIMENSION_CONFIG.offsetPx}
              labelAlong={layout[i].overall.along}
            />
          </group>
        );
      })}
    </group>
  );
});
