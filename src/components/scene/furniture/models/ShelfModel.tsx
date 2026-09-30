import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf } from './parts';
import type { FurnitureModelProps } from './types';

const PANEL = 0.02;
const BACK = 0.008;
const COMPARTMENT = 0.36;

/** Deterministischer Zufall je Fach – das Regal sieht bei jedem Laden gleich aus. */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Regal: Seiten, Böden, Rückwand und ein paar Bücher für die Erkennbarkeit. */
export function ShelfModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const wood = colorOf(colors, 'wood', C.oak);
  const inner = h - 2 * PANEL;
  const compartments = Math.max(1, Math.round(inner / COMPARTMENT));
  const step = inner / compartments;
  const boardDepth = d - BACK;
  const boards = Array.from({ length: compartments - 1 }, (_, i) => PANEL + step * (i + 1));

  const books: { x: number; y: number; z: number; size: [number, number, number]; color: string }[] = [];
  for (let c = 0; c < compartments; c++) {
    const floor = PANEL + step * c + (c === 0 ? 0 : PANEL / 2);
    const clearance = step - PANEL - 0.03;
    if (clearance < 0.12) continue;
    const rnd = seeded(c + 1);
    let x = -w / 2 + PANEL + 0.02 + rnd() * 0.05;
    const limit = -w / 2 + PANEL + (w - 2 * PANEL) * 0.7;
    while (x < limit && books.length < 60) {
      const bw = 0.025 + rnd() * 0.03;
      const bh = Math.min(clearance, 0.16 + rnd() * 0.1);
      const bd = Math.min(boardDepth - 0.04, 0.16 + rnd() * 0.06);
      books.push({ x: x + bw / 2, y: floor + bh / 2, z: -d / 2 + BACK + 0.01 + bd / 2, size: [bw, bh, bd], color: C.books[Math.floor(rnd() * C.books.length)] });
      x += bw + (rnd() < 0.15 ? 0.06 : 0.002);
    }
  }

  return (
    <group>
      {[-1, 1].map((sx) => (
        <Part key={sx} position={[sx * (w / 2 - PANEL / 2), h / 2, 0]} size={[PANEL, h, d]} color={wood} />
      ))}
      <Part position={[0, PANEL / 2, 0]} size={[w - 2 * PANEL, PANEL, d]} color={wood} />
      <Part position={[0, h - PANEL / 2, 0]} size={[w - 2 * PANEL, PANEL, d]} color={wood} />
      <Part position={[0, h / 2, -d / 2 + BACK / 2]} size={[w - 2 * PANEL, h - 2 * PANEL, BACK]} color={C.lacquer} />
      {boards.map((y, i) => (
        <Part key={i} position={[0, y, BACK / 2]} size={[w - 2 * PANEL, PANEL, boardDepth]} color={wood} />
      ))}
      {books.map((b, i) => (
        <Part key={`b${i}`} position={[b.x, b.y, b.z]} size={b.size} color={b.color} roughness={0.9} />
      ))}
    </group>
  );
}
