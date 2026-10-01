import { Line } from '@react-three/drei';
import { PLAN_SYMBOL_CONFIG } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';
import { getPlanSymbolStyle, PlanOpeningFill } from './PlanOpeningFill';

/** Strichlänge des Sturzes (m) – wie übliche Grundrissdarstellung „Öffnung mit Sturz“. */
const DASH = { dashSize: 0.06, gapSize: 0.05 } as const;

/**
 * Durchgang im Grundriss: Wandlücke mit Laibungen und gestrichelten Linien an beiden
 * Wandflächen (Sturz über der Schnittebene). Kein Türblatt, kein Bogen.
 */
export function PassagePlanSymbol({ span, wall, selected, status }: OpeningPartProps) {
  const y = wall.height + PLAN_SYMBOL_CONFIG.lineElevation;
  const half = wall.thickness / 2;
  const style = getPlanSymbolStyle({ selected, status });
  const lineProps = { color: style.line, lineWidth: PLAN_SYMBOL_CONFIG.lineWidthPx * style.emphasis };

  return (
    <group name="passage-plan-symbol">
      <PlanOpeningFill span={span} wall={wall} color={style.fill} />
      {[span.x0, span.x1].map((x) => (
        <Line key={`jamb-${x}`} points={[[x, y, -half], [x, y, half]]} {...lineProps} />
      ))}
      {[-half, half].map((z) => (
        <Line key={`lintel-${z}`} name="passage-lintel" points={[[span.x0, y, z], [span.x1, y, z]]} {...lineProps} dashed {...DASH} />
      ))}
    </group>
  );
}
