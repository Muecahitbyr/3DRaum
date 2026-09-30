import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

const LEG = 0.05;
const LEG_INSET = 0.07;

/** Tisch: Platte mit vier Beinen. */
export function TableModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const top = colorOf(colors, 'wood', C.tableTop);
  const leg = derivedOf(colors, 'wood', C.tableLeg, -0.35);
  const topT = Math.min(0.04, h * 0.1);
  const legH = h - topT;
  const insetX = Math.min(LEG_INSET, w / 2 - LEG / 2);
  const insetZ = Math.min(LEG_INSET, d / 2 - LEG / 2);

  return (
    <group>
      <Part position={[0, h - topT / 2, 0]} size={[w, topT, d]} color={top} roughness={0.55} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Part
            key={`${sx}${sz}`}
            position={[sx * (w / 2 - insetX), legH / 2, sz * (d / 2 - insetZ)]}
            size={[LEG, legH, LEG]}
            color={leg}
            roughness={0.6}
          />
        )),
      )}
    </group>
  );
}
