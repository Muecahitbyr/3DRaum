import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { SCENE_COLORS } from '../../../../config/scene';
import type { CollisionSeverity } from '../../../../collision';
import type { FurnitureItem } from '../../../../types/furniture';
import { furniturePlanDetails, furniturePlanOutline, type PlanPolyline } from '../../../../utils/furniturePlan';

/** Möbel liegen im Grundriss knapp über dem Boden – Wände verdecken sie korrekt. */
const FILL_Y = 0.012;
const LINE_Y = 0.016;
const LINE_WIDTH_PX = 1.25;

const to3d = (line: PlanPolyline): [number, number, number][] => line.map(([x, z]) => [x, LINE_Y, z]);

/** Farben je Zustand: Kollision (rot) und Warnung (bernstein) haben Vorrang vor der Auswahl. */
function planStyle(selected: boolean, status: CollisionSeverity | null) {
  if (status === 'error') return { line: SCENE_COLORS.conflict, fill: SCENE_COLORS.planConflictFill };
  if (status === 'warning') return { line: SCENE_COLORS.warning, fill: SCENE_COLORS.planWarningFill };
  if (selected) return { line: SCENE_COLORS.selection, fill: SCENE_COLORS.planSelectionFill };
  return { line: SCENE_COLORS.planSymbol, fill: SCENE_COLORS.planOpeningFill };
}

interface FurniturePlanSymbolProps {
  item: FurnitureItem;
  selected: boolean;
  status: CollisionSeverity | null;
}

/** Gewählte Möbelfarbe sehr hell (85 % Weiß) – im Grundriss erkennbar, Linien bleiben lesbar. */
function tint(item: FurnitureItem): string | null {
  const chosen = item.colors?.fabric ?? item.colors?.main ?? item.colors?.wood;
  if (!chosen) return null;
  const n = parseInt(chosen.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.8).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

export function FurniturePlanSymbol({ item, selected, status }: FurniturePlanSymbolProps) {
  const lines = useMemo(() => furniturePlanDetails(item.type, item).map(to3d), [item]);
  const outline = useMemo(() => to3d(furniturePlanOutline(item)), [item]);
  const base = planStyle(selected, status);
  const tinted = !selected && !status ? tint(item) : null;
  const style = tinted ? { ...base, fill: tinted } : base;
  const color = style.line;
  const emphasized = selected || status !== null;
  return (
    <group name="furniture-plan-symbol">
      <mesh position={[0, FILL_Y, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[item.width, item.depth]} />
        <meshBasicMaterial color={style.fill} />
      </mesh>
      <Line points={outline} color={color} lineWidth={LINE_WIDTH_PX * (emphasized ? 1.6 : 1.2)} />
      {lines.map((points, i) => (
        <Line key={i} points={points} color={color} lineWidth={LINE_WIDTH_PX * 0.8} />
      ))}
    </group>
  );
}
