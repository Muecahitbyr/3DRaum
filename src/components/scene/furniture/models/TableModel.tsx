import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { tableGeometry } from '../../../../config/furnitureGeometry';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

/** Tisch: Platte mit vier Beinen. */
export function TableModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const top = colorOf(colors, 'wood', C.tableTop);
  const leg = derivedOf(colors, 'wood', C.tableLeg, -0.35);
  // Maße gemeinsam mit den Kollisionszonen (Stühle passen zwischen die Beine).
  const { leg: LEG, topT, legH, insetX, insetZ } = tableGeometry(w, d, h);

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
