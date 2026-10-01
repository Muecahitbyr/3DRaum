import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { DIMENSION_CONFIG, SCENE_COLORS } from '../../../config/scene';
import type { FloorPoint, Meters, WallDimension } from '../../../types/room';
import { formatMeters } from '../../../utils/units';
import styles from './DimensionLine.module.css';

type Point3 = [number, number, number];

/**
 * Lesbarer Drehwinkel (Grad, Bildschirm) für Text entlang einer Linie in der Draufsicht:
 * Norden oben, x nach rechts, z nach unten. Ergebnis in [−90°, 90°) – nie auf dem Kopf;
 * senkrechte Maße lesen sich von unten nach oben (−90°), waagerechte bleiben bei 0°.
 */
export function readableAngleDeg(start: FloorPoint, end: FloorPoint): number {
  let angle = (Math.atan2(end.z - start.z, end.x - start.x) * 180) / Math.PI;
  if (angle >= 90 - 1e-9) angle -= 180;
  if (angle < -90 - 1e-9) angle += 180;
  return Math.abs(angle) < 1e-9 ? 0 : angle;
}

/** Wrapper-Stil für gedrehte Beschriftungen (keiner bei waagerechten Maßen). */
export const rotatedStyle = (angle: number) => (angle === 0 ? undefined : { display: 'inline-block', transform: `rotate(${angle}deg)` });

const HTML_STYLE = { pointerEvents: 'none' } as const;

interface DimensionLineProps {
  dimension: WallDimension;
  /** Höhe (y), auf der die Maßlinie gezeichnet wird. */
  elevation: Meters;
  /** Umrechnung Bildschirmpixel → Meter bei aktuellem Zoom. */
  metersPerPixel: number;
  /** Abstand der Maßlinie von der Wand-Außenkante in Pixeln (weiter außen, wenn eine Öffnungsmaßkette davor liegt). */
  offsetPx?: number;
  /** Lage der Beschriftung entlang der Maßlinie (m ab Anfang, Leserichtung); Standard: Mitte. */
  labelAlong?: Meters;
}

/**
 * Architektonische Maßlinie außerhalb der Wand: Hilfslinien an den Innenecken,
 * Maßlinie mit schrägen Begrenzungsstrichen und Beschriftung. Abstände und
 * Linienstärken sind in Pixeln definiert und bleiben beim Zoomen konstant.
 * Die Beschriftung folgt der Wandrichtung (auch bei schrägen Wänden).
 */
export function DimensionLine({ dimension, elevation, metersPerPixel, offsetPx = DIMENSION_CONFIG.offsetPx, labelAlong }: DimensionLineProps) {
  const { start, end, outwardNormal: n, wallThickness, length } = dimension;

  const { dimensionLine, extensionLines, ticks, labelPosition } = useMemo(() => {
    const px = (value: number) => value * metersPerPixel;
    const at = (p: FloorPoint, offset: Meters): Point3 => [
      p.x + n.x * offset,
      elevation,
      p.z + n.z * offset,
    ];

    const lineOffset = wallThickness + px(offsetPx);
    const extensionFrom = wallThickness + px(DIMENSION_CONFIG.extensionGapPx);
    const extensionTo = lineOffset + px(DIMENSION_CONFIG.extensionOvershootPx);

    // Schräger 45°-Strich: Richtung = (Wandrichtung + Normale) / √2.
    const dirX = (end.x - start.x) / length;
    const dirZ = (end.z - start.z) / length;
    const tickHalf = px(DIMENSION_CONFIG.tickHalfLengthPx) / Math.SQRT2;
    const tick = (p: FloorPoint): Point3[] => {
      const [cx, cy, cz] = at(p, lineOffset);
      const dx = (dirX + n.x) * tickHalf;
      const dz = (dirZ + n.z) * tickHalf;
      return [
        [cx - dx, cy, cz - dz],
        [cx + dx, cy, cz + dz],
      ];
    };

    return {
      dimensionLine: [at(start, lineOffset), at(end, lineOffset)],
      extensionLines: [
        [at(start, extensionFrom), at(start, extensionTo)],
        [at(end, extensionFrom), at(end, extensionTo)],
      ],
      ticks: [tick(start), tick(end)],
      labelPosition: at({ x: start.x + dirX * (labelAlong ?? length / 2), z: start.z + dirZ * (labelAlong ?? length / 2) }, lineOffset),
    };
  }, [start, end, n, wallThickness, length, elevation, metersPerPixel, offsetPx, labelAlong]);

  const lineProps = { color: SCENE_COLORS.dimensionLine, lineWidth: DIMENSION_CONFIG.lineWidthPx };

  return (
    <group>
      <Line points={dimensionLine} {...lineProps} />
      {extensionLines.map((points, i) => (
        <Line key={`ext-${i}`} points={points} {...lineProps} />
      ))}
      {ticks.map((points, i) => (
        <Line key={`tick-${i}`} points={points} {...lineProps} lineWidth={DIMENSION_CONFIG.lineWidthPx * 1.6} />
      ))}
      <Html position={labelPosition} center zIndexRange={[10, 0]} style={HTML_STYLE}>
        <span style={rotatedStyle(readableAngleDeg(start, end))}>
          <span className={styles.label} data-testid="dimension-label">
            {formatMeters(length)} m
          </span>
        </span>
      </Html>
    </group>
  );
}
