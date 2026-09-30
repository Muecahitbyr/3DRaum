import { useMemo } from 'react';
import { FURNITURE_CATALOG } from '../../config/furniture';
import type { FurnitureType } from '../../types/furniture';
import { furniturePlanDetails, furniturePlanOutline } from '../../utils/furniturePlan';

interface FurnitureIconProps {
  type: FurnitureType;
  size?: number;
}

/**
 * Grundriss-Piktogramm eines Möbeltyps – aus denselben Formen wie das 2D-Symbol
 * erzeugt (Standardmaße, proportional eingepasst). Neue Typen brauchen kein eigenes Icon.
 */
export function FurnitureIcon({ type, size = 16 }: FurnitureIconProps) {
  const paths = useMemo(() => {
    const dims = FURNITURE_CATALOG[type].defaultSize;
    const pad = 1.5;
    const scale = (size - 2 * pad) / Math.max(dims.width, dims.depth);
    const toPath = (line: [number, number][]) =>
      line.map(([x, z], i) => `${i ? 'L' : 'M'}${(size / 2 + x * scale).toFixed(2)} ${(size / 2 + z * scale).toFixed(2)}`).join('');
    return { outline: toPath(furniturePlanOutline(dims)), details: furniturePlanDetails(type, dims).map(toPath) };
  }, [type, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeLinejoin="round" aria-hidden="true">
      <path d={paths.outline} strokeWidth={1.3} />
      {paths.details.map((d, i) => (
        <path key={i} d={d} strokeWidth={0.9} />
      ))}
    </svg>
  );
}
