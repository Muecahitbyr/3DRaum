import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import type { FurnitureType } from '../../../../types/furniture';
import { cabinetFrontCount } from '../../../../utils/furniturePlan';
import { clamp } from '../../../../utils/units';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

const FRONT = 0.018;
/** Griffe liegen innerhalb der Außentiefe (exakte Bounding Box). */
const HANDLE = 0.012;
const GAP = 0.004;

type Front = { x0: number; x1: number; y0: number; y1: number; kind: 'drawer' | 'door' | 'open'; handle: 'top' | 'left' | 'right' | 'none' };

interface CabinetStyle {
  base: 'legs' | 'plinth';
  body: string;
  front: string;
  top?: string;
}

const STYLES: Partial<Record<FurnitureType, CabinetStyle>> = {
  'tv-board': { base: 'plinth', body: C.lacquer, front: C.lacquerFront },
  sideboard: { base: 'legs', body: C.oak, front: C.oak, top: C.walnut },
  dresser: { base: 'legs', body: C.lacquer, front: C.lacquerFront, top: C.oak },
  nightstand: { base: 'legs', body: C.oak, front: C.oak },
};

/** Frontaufteilung je Typ im Bereich [x0,x1] × [y0,y1]. */
function layoutFronts(type: FurnitureType, x0: number, x1: number, y0: number, y1: number): Front[] {
  const w = x1 - x0;
  const h = y1 - y0;
  switch (type) {
    case 'dresser': {
      const rows = clamp(Math.round(h / 0.2), 2, 6);
      return Array.from({ length: rows }, (_, i) => ({
        x0, x1, y0: y0 + (h / rows) * i, y1: y0 + (h / rows) * (i + 1), kind: 'drawer' as const, handle: 'top' as const,
      }));
    }
    case 'nightstand': {
      const split = y1 - h * 0.42;
      return [
        { x0, x1, y0: split, y1, kind: 'drawer', handle: 'top' },
        { x0, x1, y0, y1: split, kind: 'open', handle: 'none' },
      ];
    }
    case 'tv-board': {
      const n = cabinetFrontCount(type, w);
      return Array.from({ length: n }, (_, i) => ({
        x0: x0 + (w / n) * i, x1: x0 + (w / n) * (i + 1), y0, y1,
        kind: i === Math.floor(n / 2) ? ('open' as const) : ('door' as const),
        handle: i === Math.floor(n / 2) ? ('none' as const) : ('top' as const),
      }));
    }
    default: {
      const n = cabinetFrontCount(type, w);
      return Array.from({ length: n }, (_, i) => ({
        x0: x0 + (w / n) * i, x1: x0 + (w / n) * (i + 1), y0, y1, kind: 'door' as const,
        // Griffe paarweise an den Mittelfugen
        handle: i % 2 === 0 ? ('right' as const) : ('left' as const),
      }));
    }
  }
}

/**
 * Korpusmöbel (TV-Board, Sideboard, Kommode, Nachttisch): Korpus auf Füßen oder
 * Sockel, Fronten nach Typ (Schubladen, Türen, offene Fächer) mit Griffen.
 */
export function CabinetModel({ width: w, depth: d, height: h, type, colors }: FurnitureModelProps & { type: FurnitureType }) {
  const base = STYLES[type] ?? STYLES.sideboard!;
  // Farbbereiche: Korpus (lackiert = „main“, Holz = „wood“), Deckplatte der Kommode = Holz.
  const woodBody = base.body === C.oak;
  const style: CabinetStyle = {
    ...base,
    body: colorOf(colors, woodBody ? 'wood' : 'main', base.body),
    front: woodBody ? colorOf(colors, 'wood', base.front) : derivedOf(colors, 'main', base.front, 0.1),
    top: base.top && type === 'dresser' ? colorOf(colors, 'wood', base.top) : base.top,
  };
  const baseH = style.base === 'legs' ? Math.min(0.12, h * 0.15) : Math.min(0.06, h * 0.12);
  const topT = style.top ? Math.min(0.025, h * 0.05) : 0;
  const bodyDepth = d - FRONT - HANDLE;
  const bodyTop = h - topT;
  const frontZ = d / 2 - HANDLE - FRONT / 2;
  const fronts = layoutFronts(type, -w / 2, w / 2, baseH, bodyTop);

  return (
    <group>
      <Part position={[0, (baseH + bodyTop) / 2, -d / 2 + bodyDepth / 2]} size={[w, bodyTop - baseH, bodyDepth]} color={style.body} />
      {style.top && <Part position={[0, h - topT / 2, 0]} size={[w, topT, d]} color={style.top} roughness={0.55} />}
      {style.base === 'plinth' ? (
        <Part position={[0, baseH / 2, -d / 2 + (bodyDepth - 0.03) / 2]} size={[w - 0.04, baseH, bodyDepth - 0.03]} color={C.plinth} />
      ) : (
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Part key={`${sx}${sz}`} position={[sx * (w / 2 - 0.04), baseH / 2, sz * (d / 2 - 0.05)]} size={[0.03, baseH, 0.03]} color={C.metal} roughness={0.4} />
          )),
        )
      )}
      {fronts.map((f, i) => {
        const fw = f.x1 - f.x0 - GAP;
        const fh = f.y1 - f.y0 - GAP;
        const cx = (f.x0 + f.x1) / 2;
        const cy = (f.y0 + f.y1) / 2;
        if (f.kind === 'open') {
          return <Part key={i} position={[cx, cy, frontZ - 0.004]} size={[fw - 0.03, fh - 0.03, FRONT]} color={C.recess} roughness={0.9} />;
        }
        const handleW = f.handle === 'top' ? Math.min(0.22, fw * 0.4) : 0.014;
        const handleH = f.handle === 'top' ? 0.014 : Math.min(0.2, fh * 0.35);
        const hx = f.handle === 'right' ? f.x1 - 0.04 : f.handle === 'left' ? f.x0 + 0.04 : cx;
        const hy = f.handle === 'top' ? f.y1 - Math.min(0.05, fh * 0.25) : cy;
        return (
          <group key={i}>
            <Part position={[cx, cy, frontZ]} size={[fw, fh, FRONT]} color={style.front} roughness={0.5} />
            <Part position={[hx, hy, d / 2 - HANDLE / 2]} size={[handleW, handleH, HANDLE]} color={C.handle} roughness={0.35} />
          </group>
        );
      })}
    </group>
  );
}
