import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { clamp } from '../../../../utils/units';
import { Part, SoftPart, colorOf } from './parts';
import type { FurnitureModelProps } from './types';

const LEG = 0.03;

/** Stuhl: vier Beine, gepolsterte Sitzfläche, Rückenlehne hinten (−z). */
export function ChairModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const wood = colorOf(colors, 'wood', C.oak);
  const seat = colorOf(colors, 'fabric', C.chairSeat);
  const seatH = clamp(h * 0.5, 0.4, 0.5);
  const seatT = 0.045;
  const legH = seatH - seatT;
  const backH = h - seatH;
  const panelH = backH * 0.45;
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Part key={`${sx}${sz}`} position={[sx * (w / 2 - LEG / 2 - 0.01), legH / 2, sz * (d / 2 - LEG / 2 - 0.01)]} size={[LEG, legH, LEG]} color={wood} />
        )),
      )}
      <SoftPart position={[0, seatH - seatT / 2, 0]} size={[w, seatT, d]} color={seat} radius={0.015} />
      {[-1, 1].map((sx) => (
        <Part key={sx} position={[sx * (w / 2 - LEG / 2 - 0.01), seatH + backH / 2, -d / 2 + LEG / 2]} size={[LEG, backH, LEG]} color={wood} />
      ))}
      <Part position={[0, h - panelH / 2 - 0.02, -d / 2 + 0.0125]} size={[w - 2 * (LEG + 0.01), panelH, 0.025]} color={wood} />
    </group>
  );
}
