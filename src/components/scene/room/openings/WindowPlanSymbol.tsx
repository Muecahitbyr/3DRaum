import { Line } from '@react-three/drei';
import { PLAN_SYMBOL_CONFIG } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';
import { getPlanSymbolStyle, PlanOpeningFill } from './PlanOpeningFill';

/**
 * Fenster im Grundriss: Wandlücke mit Rahmenlinien an beiden Wandflächen und
 * doppelter Glaslinie in der Mitte; zweiflügelig zusätzlich mit Mittelpfosten.
 */
export function WindowPlanSymbol({ span, wall, selected, status, sashes = 1 }: OpeningPartProps & { sashes?: 1 | 2 }) {
  const y = wall.height + PLAN_SYMBOL_CONFIG.lineElevation;
  const half = wall.thickness / 2;
  const glassGap = wall.thickness * 0.12;
  const style = getPlanSymbolStyle({ selected, status });
  const lineProps = { color: style.line, lineWidth: PLAN_SYMBOL_CONFIG.lineWidthPx * style.emphasis };
  const across = (z: number): [number, number, number][] => [
    [span.x0, y, z],
    [span.x1, y, z],
  ];

  return (
    <group name="window-plan-symbol">
      <PlanOpeningFill span={span} wall={wall} color={style.fill} />
      <Line
        points={[
          [span.x0, y, -half],
          [span.x1, y, -half],
          [span.x1, y, half],
          [span.x0, y, half],
          [span.x0, y, -half],
        ]}
        {...lineProps}
      />
      <Line points={across(-glassGap)} {...lineProps} />
      <Line points={across(glassGap)} {...lineProps} />
      {sashes === 2 && (
        <Line
          name="window-mullion"
          points={[
            [(span.x0 + span.x1) / 2, y, -half],
            [(span.x0 + span.x1) / 2, y, half],
          ]}
          {...lineProps}
        />
      )}
    </group>
  );
}
