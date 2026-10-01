import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { officeChairGeometry } from '../../../../config/furnitureGeometry';
import { Ball, Part, Rod, SoftPart, colorOf } from './parts';
import type { FurnitureModelProps } from './types';

const CASTER = 0.025;
const SPOKE_Y = 0.065;

/**
 * Bürostuhl: Fünfsternfuß mit Rollen, Gasdruckfeder, Sitz, Rückenlehne und
 * Armlehnen. Der Fuß ist elliptisch, damit die Außenmaße exakt erreicht werden.
 */
export function OfficeChairModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const fabric = colorOf(colors, 'fabric', C.officeFabric);
  // Maße gemeinsam mit den Kollisionszonen (Armlehnen unter der Schreibtischplatte).
  const { seatH, seatT, backH, armH, backDepth } = officeChairGeometry(h);

  // Ein Stern zeigt nach vorn (+z); Speichen enden auf einer Ellipse im Grundriss.
  const spokes = Array.from({ length: 5 }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const px = Math.cos(a) * (w / 2 - CASTER);
    const pz = -Math.sin(a) * (d / 2 - CASTER);
    return { angle: Math.atan2(-pz, px), length: Math.hypot(px, pz) };
  });

  return (
    <group>
      {spokes.map((s, i) => (
        <group key={i} rotation-y={s.angle}>
          <Part position={[s.length / 2, SPOKE_Y, 0]} size={[s.length, 0.03, 0.035]} color={C.metal} roughness={0.4} />
          <Ball position={[s.length, CASTER, 0]} radius={CASTER} color={C.metal} />
        </group>
      ))}
      <Rod position={[0, SPOKE_Y, 0]} radius={0.045} height={0.05} color={C.metal} />
      <Rod position={[0, (SPOKE_Y + seatH - seatT) / 2, 0]} radius={0.022} height={seatH - seatT - SPOKE_Y} color={C.chrome} />
      <SoftPart position={[0, seatH - seatT / 2, 0.02]} size={[w * 0.8, seatT, d * 0.72]} color={fabric} radius={0.03} />
      <SoftPart position={[0, h - backH / 2, -d / 2 + backDepth / 2]} size={[w * 0.72, backH, backDepth]} color={fabric} radius={0.03} />
      <Part position={[0, seatH + 0.02, -d / 2 + 0.09]} size={[0.05, 0.14, 0.03]} color={C.metal} roughness={0.4} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Part position={[sx * (w / 2 - 0.03), seatH + armH / 2, 0]} size={[0.025, armH, 0.025]} color={C.metal} roughness={0.4} />
          <Part position={[sx * (w / 2 - 0.025), seatH + armH + 0.015, 0]} size={[0.05, 0.03, Math.min(0.26, d * 0.45)]} color={C.metal} roughness={0.6} />
        </group>
      ))}
    </group>
  );
}
