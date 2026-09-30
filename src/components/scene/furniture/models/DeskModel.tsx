import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

const TOP = 0.03;
const SIDE = 0.025;
const FRONT = 0.018;
const HANDLE = 0.012;

/** Schreibtisch: Platte, Seitenwange links, Schubladen-Container rechts, Sichtblende hinten. */
export function DeskModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const top = colorOf(colors, 'wood', C.oak);
  const body = colorOf(colors, 'main', C.lacquer);
  const front = derivedOf(colors, 'main', C.lacquerFront, 0.1);
  const under = h - TOP;
  const pw = Math.min(0.42, w * 0.32);
  const pedestalDepth = d - 0.03 - FRONT - HANDLE;
  const px = w / 2 - pw / 2;
  const drawers = 3;
  const panelH = under * 0.45;
  return (
    <group>
      <Part position={[0, h - TOP / 2, 0]} size={[w, TOP, d]} color={top} roughness={0.55} />
      <Part position={[-w / 2 + SIDE / 2, under / 2, 0]} size={[SIDE, under, d - 0.04]} color={body} />
      <Part position={[px, under / 2, -d / 2 + 0.03 + pedestalDepth / 2]} size={[pw, under, pedestalDepth]} color={body} />
      {Array.from({ length: drawers }, (_, i) => {
        const fh = under / drawers - 0.006;
        const cy = (under / drawers) * (i + 0.5);
        return (
          <group key={i}>
            <Part position={[px, cy, d / 2 - HANDLE - FRONT / 2]} size={[pw - 0.006, fh, FRONT]} color={front} roughness={0.5} />
            <Part position={[px, cy + fh * 0.25, d / 2 - HANDLE / 2]} size={[Math.min(0.16, pw * 0.45), 0.014, HANDLE]} color={C.handle} roughness={0.35} />
          </group>
        );
      })}
      <Part position={[(-w / 2 + SIDE + (w / 2 - pw)) / 2, under - panelH / 2, -d / 2 + 0.05]} size={[w - pw - SIDE, panelH, 0.015]} color={body} />
    </group>
  );
}
