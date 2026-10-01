import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { DIMENSION_CONFIG, SCENE_COLORS } from '../../../config/scene';
import type { Meters, WallDimension } from '../../../types/room';
import { dimensionPoint, type ChainLabel } from '../../../utils/room/dimensionLayout';
import type { ChainSegment } from '../../../utils/room/measurements';
import { readableAngleDeg, rotatedStyle } from './DimensionLine';
import styles from './DimensionLine.module.css';

type Point3 = [number, number, number];

const HTML_STYLE = { pointerEvents: 'none' } as const;

interface DimensionChainProps {
  /** Wand in Grundriss-Leserichtung (Anfang links bzw. oben). */
  dimension: WallDimension;
  wallId: string;
  /** Abschnitte in Leserichtung (0 … Wandlänge): Wandstücke und Öffnungsbreiten. */
  segments: readonly ChainSegment[];
  /** Sichtbare Beschriftungen samt Lage (aus `layoutRoomDimensions`). */
  labels: readonly ChainLabel[];
  elevation: Meters;
  metersPerPixel: number;
}

/**
 * Öffnungsmaßkette einer Wand: eine Maßlinie nah an der Wand mit Begrenzungsstrichen an
 * jeder Öffnungskante – so sind Abstand von der Ecke, Öffnungsbreite und Restabstand
 * ablesbar. Zahlen in Metern ohne Einheit (wie im Bauplan), dezent ohne Rahmen.
 * Wo eine Zahl steht (in der Kette, auf der zweiten Spur oder gar nicht), entscheidet die
 * gemeinsame Platzierung aller Wandmaße.
 */
export function DimensionChain({ dimension, wallId, segments, labels, elevation, metersPerPixel }: DimensionChainProps) {
  const { start, end, outwardNormal: n, wallThickness, length } = dimension;

  const { lines, ticks } = useMemo(() => {
    const px = (value: number) => value * metersPerPixel;
    const dir = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
    const at = (along: Meters, offset: Meters): Point3 => {
      const p = dimensionPoint(dimension, along, offset);
      return [p.x, elevation, p.z];
    };
    const lineOffset = wallThickness + px(DIMENSION_CONFIG.chainOffsetPx);
    const tickHalf = px(DIMENSION_CONFIG.tickHalfLengthPx) / Math.SQRT2;
    const tick = (along: Meters): Point3[] => {
      const [cx, cy, cz] = at(along, lineOffset);
      const dx = (dir.x + n.x) * tickHalf;
      const dz = (dir.z + n.z) * tickHalf;
      return [
        [cx - dx, cy, cz - dz],
        [cx + dx, cy, cz + dz],
      ];
    };
    const breakpoints = [0, ...segments.map((s) => s.to)];
    // Hilfslinien nur an den Öffnungskanten; an den Ecken liegen die des Gesamtmaßes.
    const extension = (along: Meters): Point3[] => [
      at(along, wallThickness + px(DIMENSION_CONFIG.extensionGapPx)),
      at(along, lineOffset + px(DIMENSION_CONFIG.extensionOvershootPx)),
    ];
    return {
      lines: [[at(0, lineOffset), at(length, lineOffset)], ...breakpoints.slice(1, -1).map(extension)],
      ticks: breakpoints.map(tick),
    };
  }, [dimension, start, end, n, wallThickness, length, segments, elevation, metersPerPixel]);

  const lineProps = { color: SCENE_COLORS.dimensionLine, lineWidth: DIMENSION_CONFIG.lineWidthPx };
  const labelStyle = rotatedStyle(readableAngleDeg(start, end));

  return (
    <group name={`opening-chain-${wallId}`}>
      {lines.map((points, i) => (
        <Line key={`line-${i}`} points={points} {...lineProps} />
      ))}
      {ticks.map((points, i) => (
        <Line key={`tick-${i}`} points={points} {...lineProps} lineWidth={DIMENSION_CONFIG.lineWidthPx * 1.6} />
      ))}
      {labels.map(({ segment, text, placement, along, offset }) => {
        const p = dimensionPoint(dimension, along, offset);
        return (
          <Html key={`${segment.from}-${segment.to}`} position={[p.x, elevation, p.z]} center zIndexRange={[9, 0]} style={HTML_STYLE}>
            <span style={labelStyle}>
              <span
                className={styles.chainLabel}
                data-testid="opening-dimension-label"
                data-wall={wallId}
                data-opening={segment.opening}
                data-placement={placement}
                data-length={segment.length.toFixed(4)}
              >
                {text}
              </span>
            </span>
          </Html>
        );
      })}
    </group>
  );
}
