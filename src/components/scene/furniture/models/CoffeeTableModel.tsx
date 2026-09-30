import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

const LEG = 0.045;

/** Couchtisch: kräftige Platte, vier Beine und eine Ablage darunter. */
export function CoffeeTableModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const top = colorOf(colors, 'wood', C.oak);
  const dark = derivedOf(colors, 'wood', C.walnut, -0.4);
  const topT = Math.min(0.045, h * 0.15);
  const legH = h - topT;
  const inset = Math.min(0.03, w / 8, d / 8);
  const shelfY = Math.min(0.1, legH * 0.3);
  return (
    <group>
      <Part position={[0, h - topT / 2, 0]} size={[w, topT, d]} color={top} roughness={0.55} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Part key={`${sx}${sz}`} position={[sx * (w / 2 - inset - LEG / 2), legH / 2, sz * (d / 2 - inset - LEG / 2)]} size={[LEG, legH, LEG]} color={dark} />
        )),
      )}
      <Part position={[0, shelfY, 0]} size={[w - 2 * (inset + LEG), 0.02, d - 2 * (inset + LEG)]} color={dark} />
    </group>
  );
}
