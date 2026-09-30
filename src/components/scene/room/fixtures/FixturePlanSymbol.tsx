import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { PLAN_SYMBOL_CONFIG } from '../../../../config/scene';
import type { CollisionSeverity } from '../../../../collision';
import type { FixtureType } from '../../../../types/fixture';
import type { FixtureLocalSpan } from '../../../../utils/fixtures';
import { getPlanSymbolStyle } from '../openings/PlanOpeningFill';

/**
 * Raumobjekte liegen im Grundriss knapp über den Möbelsymbolen (die bei 0,012–0,016 m
 * liegen), damit z. B. ein Heizkörper hinter einem Sofa sichtbar bleibt.
 */
export const FIXTURE_PLAN_Y = { fill: 0.02, line: 0.024, hit: 0.028 } as const;

/** Radius der Steckdosen-/Schaltersymbole (unabhängig von der echten Plattengröße gut lesbar). */
export const FIXTURE_SYMBOL_RADIUS = 0.07;

interface FixturePlanSymbolProps {
  type: FixtureType;
  span: FixtureLocalSpan;
  selected: boolean;
  status: CollisionSeverity | null;
}

type P3 = [number, number, number];

function arc(cx: number, cz: number, radius: number, from: number, to: number, y: number, segments = 20): P3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / segments;
    return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
  });
}

/**
 * Grundriss-Symbole (lokales Wandsystem, +z = Raum):
 * - Heizkörper: Rechteck in echter Größe mit Mittellinie und Rippenstrichen
 * - Steckdose: Halbkreis an der Wand mit Anschlussstrich (übliches Planzeichen)
 * - Lichtschalter: Kreis mit schrägem Schaltstrich
 */
export function FixturePlanSymbol({ type, span, selected, status }: FixturePlanSymbolProps) {
  const { line: color, fill, emphasis } = getPlanSymbolStyle({ selected, status });
  const width = PLAN_SYMBOL_CONFIG.lineWidthPx * emphasis;
  const y = FIXTURE_PLAN_Y.line;
  const cx = (span.x0 + span.x1) / 2;

  const lines = useMemo((): P3[][] => {
    if (type === 'radiator') {
      const { x0, x1, z0, z1 } = span;
      const mid = (z0 + z1) / 2;
      const ticks = Math.max(2, Math.round((x1 - x0) / 0.1));
      const result: P3[][] = [
        [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]],
        [[x0, y, mid], [x1, y, mid]],
      ];
      for (let i = 1; i < ticks; i++) {
        const x = x0 + ((x1 - x0) * i) / ticks;
        result.push([[x, y, z0 + (z1 - z0) * 0.2], [x, y, z1 - (z1 - z0) * 0.2]]);
      }
      return result;
    }
    const r = FIXTURE_SYMBOL_RADIUS;
    const face = span.z0;
    if (type === 'socket') {
      return [
        [...arc(cx, face, r, 0, Math.PI, y), [cx - r, y, face], [cx + r, y, face]],
        [[cx, y, face + r], [cx, y, face + r * 1.6]],
      ];
    }
    const cz = face + r * 0.9;
    return [
      [...arc(cx, cz, r * 0.55, 0, Math.PI * 2, y, 28)],
      [[cx + r * 0.39, y, cz + r * 0.39], [cx + r * 1.1, y, cz + r * 1.1]],
      [[cx, y, face], [cx, y, cz - r * 0.55]],
    ];
  }, [type, span, cx, y]);

  return (
    <group name={`${type}-plan-symbol`}>
      {type === 'radiator' ? (
        <mesh position={[cx, FIXTURE_PLAN_Y.fill, (span.z0 + span.z1) / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[span.x1 - span.x0, span.z1 - span.z0]} />
          <meshBasicMaterial color={fill} />
        </mesh>
      ) : (
        <mesh position={[cx, FIXTURE_PLAN_Y.fill, span.z0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[FIXTURE_SYMBOL_RADIUS, 24, Math.PI, Math.PI]} />
          <meshBasicMaterial color={fill} />
        </mesh>
      )}
      {lines.map((points, i) => (
        <Line key={i} points={points} color={color} lineWidth={i === 0 ? width * 1.2 : width} />
      ))}
    </group>
  );
}
