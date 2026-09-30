import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { PLAN_SYMBOL_CONFIG } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';
import { getPlanSymbolStyle, PlanOpeningFill } from './PlanOpeningFill';

/**
 * Tür im Grundriss: Wandlücke, Türblatt (geöffnet, senkrecht zur Wand – nach innen
 * oder außen) und Viertelkreis als Öffnungsbogen bis zur Schließseite.
 */
export function DoorPlanSymbol({ span, wall, selected, status }: OpeningPartProps) {
  const y = wall.height + PLAN_SYMBOL_CONFIG.lineElevation;
  // Wandfläche auf der Öffnungsseite (innen: +Dicke/2, außen: −Dicke/2).
  const side = span.swingSign;
  const face = side * (wall.thickness / 2);
  const radius = Math.abs(span.strikeX - span.hingeX);
  const towardsStrike = Math.sign(span.strikeX - span.hingeX);
  const { line: color, fill, emphasis } = getPlanSymbolStyle({ selected, status });

  const arc = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= PLAN_SYMBOL_CONFIG.arcSegments; i++) {
      const angle = (i / PLAN_SYMBOL_CONFIG.arcSegments) * (Math.PI / 2);
      points.push([
        span.hingeX + towardsStrike * radius * Math.sin(angle),
        y,
        face + side * radius * Math.cos(angle),
      ]);
    }
    return points;
  }, [span.hingeX, towardsStrike, radius, y, face, side]);

  return (
    <group name="door-plan-symbol">
      <PlanOpeningFill span={span} wall={wall} color={fill} />
      <Line
        name="door-leaf-line"
        points={[
          [span.hingeX, y, face],
          [span.hingeX, y, face + side * radius],
        ]}
        color={color}
        lineWidth={PLAN_SYMBOL_CONFIG.doorLeafWidthPx * emphasis}
      />
      <Line name="door-arc" points={arc} color={color} lineWidth={PLAN_SYMBOL_CONFIG.lineWidthPx * emphasis} />
    </group>
  );
}
