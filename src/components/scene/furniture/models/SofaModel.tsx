import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { clamp } from '../../../../utils/units';
import { Part, SoftPart, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

interface SofaModelProps extends FurnitureModelProps {
  /** Bezugsfarben (Standard: Sofa-Stoff). */
  /** Standardfarben (Sessel nutzt eigene). */
  fabric?: string;
  cushion?: string;
}

/** Sofa: Rückenlehne hinten (−z), Armlehnen links/rechts, Sitz- und Rückenkissen, Füße. */
export function SofaModel({ width: w, depth: d, height: h, colors, fabric: defaultFabric = C.fabric, cushion: defaultCushion = C.cushion }: SofaModelProps) {
  const fabric = colorOf(colors, 'fabric', defaultFabric);
  const cushion = derivedOf(colors, 'fabric', defaultCushion, 0.08);
  const legH = Math.min(0.08, h * 0.1);
  const armW = clamp(w * 0.1, 0.1, 0.22);
  const backD = clamp(d * 0.22, 0.12, 0.25);
  const seatTop = clamp(h * 0.5, legH + 0.15, h - 0.1);
  const armTop = clamp(h * 0.72, seatTop + 0.05, h);
  const cushionH = Math.min(0.14, (seatTop - legH) * 0.5);
  const seatBaseTop = seatTop - cushionH;

  const innerW = w - 2 * armW;
  const seatD = d - backD;
  const cushionCount = innerW > 1.5 ? 3 : innerW > 0.8 ? 2 : 1;
  const cushionW = innerW / cushionCount;
  const backCushionH = Math.max(0.1, Math.min(h - seatTop - 0.04, 0.45));
  const backCushionD = Math.min(0.14, seatD * 0.3);

  return (
    <group>
      {/* Unterbau und Sitzfläche */}
      <Part position={[0, (legH + seatBaseTop) / 2, backD / 2]} size={[innerW, seatBaseTop - legH, seatD]} color={fabric} roughness={0.95} />
      <SoftPart position={[0, (legH + h) / 2, -d / 2 + backD / 2]} size={[w, h - legH, backD]} color={fabric} radius={0.05} />
      {[-1, 1].map((side) => (
        <SoftPart
          key={side}
          position={[side * (w / 2 - armW / 2), (legH + armTop) / 2, backD / 2]}
          size={[armW, armTop - legH, seatD]}
          color={fabric}
          radius={0.05}
        />
      ))}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = -innerW / 2 + cushionW / 2 + i * cushionW;
        return (
          <group key={i}>
            <SoftPart position={[x, seatBaseTop + cushionH / 2, backD / 2 + 0.005]} size={[cushionW - 0.01, cushionH, seatD - 0.01]} color={cushion} radius={0.04} />
            <SoftPart
              position={[x, seatTop + backCushionH / 2, -d / 2 + backD + backCushionD / 2]}
              size={[cushionW - 0.01, backCushionH, backCushionD]}
              rotation={[-0.1, 0, 0]}
              color={cushion}
              radius={0.04}
            />
          </group>
        );
      })}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Part key={`${sx}${sz}`} position={[sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06)]} size={[0.04, legH, 0.04]} color={C.leg} roughness={0.5} />
        )),
      )}
    </group>
  );
}
