import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { FURNITURE_CATALOG } from '../../../../config/furniture';
import { SCENE_COLORS } from '../../../../config/scene';
import type { CollisionSeverity } from '../../../../collision';
import type { FurnitureItem } from '../../../../types/furniture';
import { furniturePlanDetails, furniturePlanOutline, type PlanPolyline } from '../../../../utils/furniturePlan';

/** Möbel liegen im Grundriss knapp über dem Boden – Wände verdecken sie korrekt. */
const FILL_Y = 0.012;
const LINE_Y = 0.016;
/** Teppiche eine Ebene tiefer: Möbel darauf decken sie im Grundriss ab (kein Z-Fighting). */
const RUG_FILL_Y = 0.004;
const RUG_LINE_Y = 0.006;
/** Oberschränke knapp über den Unterschränken: Klicks treffen zuerst den Oberschrank. */
const WALL_MOUNTED_FILL_Y = 0.013;
const LINE_WIDTH_PX = 1.25;

const to3d = (line: PlanPolyline, y = LINE_Y): [number, number, number][] => line.map(([x, z]) => [x, y, z]);

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
  const rug = item.type === 'rug';
  const lineY = rug ? RUG_LINE_Y : LINE_Y;
  const lines = useMemo(() => furniturePlanDetails(item.type, item).map((l) => to3d(l, lineY)), [item, lineY]);
  const outline = useMemo(() => to3d(furniturePlanOutline(item), lineY), [item, lineY]);
  const base = planStyle(selected, status);
  const tinted = !selected && !status ? tint(item) : null;
  const style = tinted ? { ...base, fill: tinted } : base;
  // Teppich dezent: helle Linien, solange er nicht ausgewählt ist.
  const color = rug && !selected && !status ? SCENE_COLORS.planRugLine : style.line;
  const emphasized = selected || status !== null;
  // Oberschränke hängen über der Schnittebene: Umriss gestrichelt (übliche Grundrissdarstellung).
  // Ihre Fläche bleibt durchsichtig (Unterschränke darunter sichtbar), nur Auswahl/Kollision tönt sie.
  const dashed = !!FURNITURE_CATALOG[item.type].wallMounted;
  const fillY = rug ? RUG_FILL_Y : dashed ? WALL_MOUNTED_FILL_Y : FILL_Y;
  return (
    <group name="furniture-plan-symbol">
      <mesh position={[0, fillY, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[item.width, item.depth]} />
        {dashed ? (
          <meshBasicMaterial color={style.fill} transparent opacity={emphasized ? 0.45 : 0} depthWrite={false} />
        ) : (
          <meshBasicMaterial color={style.fill} />
        )}
      </mesh>
      <Line
        points={outline}
        color={color}
        lineWidth={LINE_WIDTH_PX * (emphasized ? 1.6 : 1.2)}
        dashed={dashed}
        dashSize={0.06}
        gapSize={0.04}
      />
      {lines.map((points, i) => (
        <Line key={i} points={points} color={color} lineWidth={LINE_WIDTH_PX * 0.8} dashed={dashed} dashSize={0.06} gapSize={0.04} />
      ))}
    </group>
  );
}
