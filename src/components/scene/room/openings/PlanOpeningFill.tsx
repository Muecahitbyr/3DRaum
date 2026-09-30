import { PLAN_SYMBOL_CONFIG, SCENE_COLORS } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';

/** Farben eines Grundriss-Symbols je nach Zustand (Kollision/Warnung haben Vorrang vor Auswahl). */
export function getPlanSymbolStyle({ selected, status }: Pick<OpeningPartProps, 'selected' | 'status'>) {
  if (status === 'error') return { line: SCENE_COLORS.conflict, fill: SCENE_COLORS.planConflictFill, emphasis: 1.6 };
  if (status === 'warning') return { line: SCENE_COLORS.warning, fill: SCENE_COLORS.planWarningFill, emphasis: 1.4 };
  if (selected) return { line: SCENE_COLORS.selection, fill: SCENE_COLORS.planSelectionFill, emphasis: 1.6 };
  return { line: SCENE_COLORS.planSymbol, fill: SCENE_COLORS.planOpeningFill, emphasis: 1 };
}

/** Fläche in der Wandlücke, damit Öffnungen im Grundriss klar erkennbar sind. */
export function PlanOpeningFill({ span, wall, color }: Pick<OpeningPartProps, 'span' | 'wall'> & { color: string }) {
  return (
    <mesh
      position={[(span.x0 + span.x1) / 2, wall.height + PLAN_SYMBOL_CONFIG.fillElevation, 0]}
      rotation-x={-Math.PI / 2}
    >
      <planeGeometry args={[span.x1 - span.x0, wall.thickness]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}
