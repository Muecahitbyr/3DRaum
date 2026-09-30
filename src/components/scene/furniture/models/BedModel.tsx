import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, SoftPart, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

/** Bett: Länge entlang der Breite (x), Kopfteil am linken Ende (−x). */
export function BedModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const wood = colorOf(colors, 'wood', C.wood);
  const woodDark = derivedOf(colors, 'wood', C.woodDark, -0.28);
  const blanket = colorOf(colors, 'fabric', C.blanket);
  const headboard = Math.min(0.06, w * 0.08);
  const baseTop = h * 0.5;
  const mattressTop = h * 0.8;
  const x0 = -w / 2 + headboard;
  const x1 = w / 2 - 0.02;
  const mattressLength = x1 - x0;

  const blanketStart = x0 + mattressLength * 0.32;
  const blanketH = Math.min(0.03, h - mattressTop);

  const pillowCount = d > 1.3 ? 2 : 1;
  const pillowLength = Math.min(0.35, mattressLength * 0.2);
  const pillowH = Math.min(0.1, h - mattressTop - 0.005);
  const pillowGap = 0.06;
  const pillowWidth = Math.max(0.15, (d - 0.12 - (pillowCount - 1) * pillowGap) / pillowCount);

  return (
    <group>
      <Part position={[0, baseTop / 2, 0]} size={[w, baseTop, d]} color={wood} />
      <Part position={[-w / 2 + headboard / 2, h / 2, 0]} size={[headboard, h, d]} color={woodDark} />
      <SoftPart
        position={[(x0 + x1) / 2, (baseTop + mattressTop) / 2, 0]}
        size={[mattressLength, mattressTop - baseTop, d - 0.04]}
        color={C.linen}
        radius={0.04}
      />
      <SoftPart
        position={[(blanketStart + x1 + 0.01) / 2, mattressTop + blanketH / 2, 0]}
        size={[x1 + 0.01 - blanketStart, blanketH, d - 0.02]}
        color={blanket}
        radius={0.012}
      />
      {Array.from({ length: pillowCount }, (_, i) => {
        const z = -((pillowCount - 1) * (pillowWidth + pillowGap)) / 2 + i * (pillowWidth + pillowGap);
        return (
          <SoftPart
            key={i}
            position={[x0 + 0.04 + pillowLength / 2, mattressTop + pillowH / 2, z]}
            size={[pillowLength, pillowH, pillowWidth]}
            color={C.pillow}
            radius={0.035}
          />
        );
      })}
    </group>
  );
}
