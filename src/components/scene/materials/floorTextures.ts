import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { FloorMaterialId } from '../../../types/design';

/**
 * Prozedurale Bodentexturen (Canvas, keine Downloads). Jede Textur ist nahtlos
 * kachelbar und deterministisch (fester Seed) und wird nur einmal erzeugt.
 * Neben der Farbtextur entsteht eine Relieftextur (Bump-Map): hell = erhaben,
 * dunkel = Fuge – das gibt Tiefe bei sehr geringen Kosten.
 */

type Ctx = CanvasRenderingContext2D;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return [element, element.getContext('2d')!];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Kachelbares Wertrauschen 0..1 (Gitter mit `cells` Zellen, weich interpoliert). */
function tileableNoise(size: number, cells: number, rng: () => number): Float32Array {
  const grid = Float32Array.from({ length: cells * cells }, rng);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const x1 = (x0 + 1) % cells;
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Mehrere Rausch-Oktaven überlagert (normiert auf 0..1). */
function fbm(size: number, octaves: [cells: number, weight: number][], rng: () => number): Float32Array {
  const out = new Float32Array(size * size);
  const total = octaves.reduce((sum, [, w]) => sum + w, 0);
  for (const [cells, weight] of octaves) {
    const layer = tileableNoise(size, cells, rng);
    for (let i = 0; i < out.length; i++) out[i] += (layer[i] * weight) / total;
  }
  return out;
}

/** Zeichnet ein Element, das über den linken/rechten Rand ragt, zusätzlich versetzt (nahtlose Wiederholung). */
function wrapped(size: number, x: number, width: number, draw: (offsetX: number) => void) {
  draw(x);
  if (x < 0) draw(x + size);
  if (x + width > size) draw(x - size);
}

// ---------------------------------------------------------------- Holz

interface WoodPalette {
  base: [h: number, s: number, l: number];
  grain: string;
  grainLight: string;
  knot: string;
  gap: string;
}

function wood(palette: WoodPalette, seed: number, rows = 12) {
  const size = 1024;
  // Standard: 2,4 m Kachel / 0,20 m Dielenbreite (bei 1,2 m Kachel und 12 Reihen: 0,10 m Stäbe)
  const rowHeight = size / rows;
  const pxPerMeter = size / 2.4;
  const rng = mulberry32(seed);
  const [color, c] = canvas(size);
  const [bump, b] = canvas(size);
  b.fillStyle = '#ffffff';
  b.fillRect(0, 0, size, size);

  for (let row = 0; row < rows; row++) {
    const top = row * rowHeight;
    let x = -rng() * 0.9 * pxPerMeter;
    const end = x + size;
    while (x < end) {
      const length = Math.min((0.9 + rng() * 0.9) * pxPerMeter, end - x);
      const [h, s, l] = palette.base;
      const fill = `hsl(${h + (rng() - 0.5) * 6} ${s + (rng() - 0.5) * 10}% ${l + (rng() - 0.5) * 10}%)`;
      const grainSeed = rng() * 1000;
      // Äste selten, länglich und weich – sonst wirken sie wie Bohrlöcher.
      const knot = rng() < 0.12 ? { at: rng(), dy: 0.3 + rng() * 0.4, r: 4 + rng() * 4 } : null;
      const plankX = x;
      wrapped(size, plankX, length, (px) => {
        c.save();
        c.beginPath();
        c.rect(px, top, length, rowHeight);
        c.clip();
        c.fillStyle = fill;
        c.fillRect(px, top, length, rowHeight);
        // Maserung: leicht gewellte Längslinien
        const local = mulberry32(grainSeed);
        for (let g = 0; g < 16; g++) {
          const y0 = top + ((g + local()) / 16) * rowHeight;
          const amp = 0.8 + local() * 2.2;
          const freq = 0.004 + local() * 0.01;
          const phase = local() * 10;
          c.beginPath();
          for (let t = 0; t <= length; t += 12) c.lineTo(px + t, y0 + Math.sin((px + t) * freq + phase) * amp);
          c.strokeStyle = local() < 0.7 ? palette.grain : palette.grainLight;
          c.globalAlpha = 0.05 + local() * 0.12;
          c.lineWidth = 0.6 + local() * 1.6;
          c.stroke();
        }
        c.globalAlpha = 1;
        if (knot) {
          const kx = px + knot.at * length;
          const ky = top + knot.dy * rowHeight;
          c.save();
          c.translate(kx, ky);
          c.scale(3.2, 1);
          const gradient = c.createRadialGradient(0, 0, 0, 0, 0, knot.r);
          gradient.addColorStop(0, palette.knot);
          gradient.addColorStop(0.6, palette.knot.replace(/[\d.]+\)$/, '0.12)'));
          gradient.addColorStop(1, 'transparent');
          c.fillStyle = gradient;
          c.beginPath();
          c.arc(0, 0, knot.r, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
        c.restore();
        // Stoßfuge am Dielenanfang
        c.fillStyle = palette.gap;
        c.fillRect(px, top, 2, rowHeight);
        b.fillStyle = '#303030';
        b.fillRect(px, top, 2, rowHeight);
      });
      x += length;
    }
    // Längsfuge zwischen den Dielenreihen
    c.fillStyle = palette.gap;
    c.fillRect(0, top, size, 2);
    b.fillStyle = '#303030';
    b.fillRect(0, top, size, 2);
  }
  return { color, bump };
}

// ---------------------------------------------------------------- Fischgrät

/**
 * Fischgrät (französisch/Chevron): Spalten mit schräg (45°) abgeschnittenen Stäben,
 * abwechselnd steigend und fallend. Pixelweise berechnet, dadurch exakt nahtlos.
 * 0,8 m Kachel: 4 Spalten à 0,20 m, Stabbreite 0,10 m.
 */
function herringbone(seed: number) {
  const size = 1024;
  const columns = 4;
  const colWidth = size / columns;
  const plank = size / 8;
  const rng = mulberry32(seed);
  const grain = fbm(size, [[8, 0.4], [40, 0.35], [160, 0.25]], rng);
  const shades = Array.from({ length: 64 }, () => rng());
  const [color, c] = canvas(size);
  const [bump, b] = canvas(size);
  const image = c.createImageData(size, size);
  const relief = b.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const column = Math.floor(x / colWidth);
      const t = x - column * colWidth;
      const slope = column % 2 === 0 ? 1 : -1;
      const v = y - slope * t;
      const k = Math.floor(v / plank);
      const along = v - k * plank;
      const edge = Math.min(along, plank - along, t, colWidth - t);
      const shade = shades[(((k % 64) + 64) % 64 + column * 7) % 64];
      const g = grain[y * size + x];
      const l = 0.88 + shade * 0.16 + (g - 0.5) * 0.18;
      const gap = edge < 1.6;
      const i = (y * size + x) * 4;
      image.data[i] = gap ? 96 : 186 * l;
      image.data[i + 1] = gap ? 68 : 140 * l;
      image.data[i + 2] = gap ? 44 : 92 * l;
      image.data[i + 3] = 255;
      const r = gap ? 40 : 200 + g * 55;
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = r;
      relief.data[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  b.putImageData(relief, 0, 0);
  return { color, bump };
}

// ---------------------------------------------------------------- Fliesen

interface TilePalette {
  hue: number;
  saturation: number;
  lightness: number;
  grout: string;
  speckDark: string;
  speckLight: string;
}

const LIGHT_TILES: TilePalette = { hue: 38, saturation: 12, lightness: 88, grout: '#b9b3a9', speckDark: 'rgba(90,80,70,0.10)', speckLight: 'rgba(255,255,255,0.35)' };

function tiles(seed: number, count = 4, palette: TilePalette = LIGHT_TILES) {
  const size = 1024;
  // Standard: 2,4 m Kachel / 0,60 m Fliese (count = 2 → 1,20 m Großformat)
  const tile = size / count;
  const grout = count <= 2 ? 3 : 5;
  const rng = mulberry32(seed);
  const [color, c] = canvas(size);
  const [bump, b] = canvas(size);
  for (let ty = 0; ty < count; ty++) {
    for (let tx = 0; tx < count; tx++) {
      const l = palette.lightness + (rng() - 0.5) * 3;
      c.fillStyle = `hsl(${palette.hue} ${palette.saturation}% ${l}%)`;
      c.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }
  // feine Sprenkel für eine natürliche Oberfläche
  for (let i = 0; i < 5000; i++) {
    c.fillStyle = rng() < 0.5 ? palette.speckDark : palette.speckLight;
    c.fillRect(rng() * size, rng() * size, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  b.fillStyle = '#ffffff';
  b.fillRect(0, 0, size, size);
  // Fugen: an jeder Kachelgrenze, am Rand halbiert → nahtlos
  for (let k = 0; k <= count; k++) {
    const p = k * tile - grout / 2;
    for (const [ctx, style] of [
      [c, palette.grout],
      [b, '#2a2a2a'],
    ] as const) {
      ctx.fillStyle = style;
      ctx.fillRect(p, 0, grout, size);
      ctx.fillRect(0, p, size, grout);
    }
  }
  return { color, bump };
}

// ---------------------------------------------------------------- Rauschbasierte Böden

function noiseSurface(
  size: number,
  octaves: [number, number][],
  seed: number,
  shade: (v: number) => [number, number, number],
  pores: { count: number; color: string } | null,
) {
  const rng = mulberry32(seed);
  const noise = fbm(size, octaves, rng);
  const [color, c] = canvas(size);
  const [bump, b] = canvas(size);
  const image = c.createImageData(size, size);
  const relief = b.createImageData(size, size);
  for (let i = 0; i < noise.length; i++) {
    const [r, g, bl] = shade(noise[i]);
    image.data.set([r, g, bl, 255], i * 4);
    const v = Math.round(noise[i] * 255);
    relief.data.set([v, v, v, 255], i * 4);
  }
  c.putImageData(image, 0, 0);
  b.putImageData(relief, 0, 0);
  if (pores) {
    for (let i = 0; i < pores.count; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.5 + rng() * 0.9;
      for (const [ctx, style] of [
        [c, pores.color],
        [b, '#000000'],
      ] as const) {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return { color, bump };
}

const concrete = (seed: number) =>
  noiseSurface(512, [[3, 0.45], [7, 0.3], [18, 0.15], [90, 0.1]], seed, (v) => {
    const k = 0.84 + v * 0.3;
    return [168 * k, 167 * k, 162 * k];
  }, { count: 220, color: 'rgba(70,70,68,0.22)' });

const carpet = (seed: number, base: [number, number, number] = [183, 171, 156]) =>
  noiseSurface(512, [[6, 0.25], [64, 0.35], [200, 0.4]], seed, (v) => {
    const k = 0.86 + v * 0.26;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, null);

const GENERATORS: Record<FloorMaterialId, () => { color: HTMLCanvasElement; bump: HTMLCanvasElement }> = {
  'wood-light': () =>
    wood({ base: [34, 46, 70], grain: '#7a5230', grainLight: '#f0dcbc', knot: 'rgba(110,70,35,0.55)', gap: 'rgba(80,55,30,0.55)' }, 11),
  'wood-dark': () =>
    wood({ base: [24, 40, 29], grain: '#1e120a', grainLight: '#9a7150', knot: 'rgba(25,14,6,0.6)', gap: 'rgba(15,8,4,0.7)' }, 23),
  tiles: () => tiles(37),
  concrete: () => concrete(41),
  carpet: () => carpet(53),
  oak: () =>
    wood({ base: [33, 30, 60], grain: '#6e5236', grainLight: '#eadcc4', knot: 'rgba(95,70,45,0.5)', gap: 'rgba(70,52,34,0.5)' }, 61),
  'parquet-dark': () =>
    wood({ base: [22, 38, 24], grain: '#170d06', grainLight: '#8a6344', knot: 'rgba(20,10,4,0.6)', gap: 'rgba(12,6,3,0.7)' }, 67, 12),
  herringbone: () => herringbone(71),
  'tiles-large-light': () => tiles(73, 2, { hue: 36, saturation: 8, lightness: 91, grout: '#cfc9bf', speckDark: 'rgba(90,80,70,0.07)', speckLight: 'rgba(255,255,255,0.3)' }),
  'tiles-large-dark': () => tiles(79, 2, { hue: 215, saturation: 5, lightness: 34, grout: '#26282b', speckDark: 'rgba(0,0,0,0.12)', speckLight: 'rgba(255,255,255,0.06)' }),
  'carpet-light': () => carpet(83, [222, 214, 200]),
  'carpet-dark': () => carpet(89, [80, 84, 89]),
};

export interface FloorTextures {
  map: CanvasTexture;
  bump: CanvasTexture;
}

const cache = new Map<FloorMaterialId, FloorTextures>();

/** Texturen eines Bodenbelags (einmalig erzeugt, danach aus dem Cache). */
export function getFloorTextures(id: FloorMaterialId): FloorTextures {
  const cached = cache.get(id);
  if (cached) return cached;
  const { color, bump } = GENERATORS[id]();
  const map = new CanvasTexture(color);
  map.colorSpace = SRGBColorSpace;
  const bumpMap = new CanvasTexture(bump);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
  }
  const textures = { map, bump: bumpMap };
  cache.set(id, textures);
  return textures;
}
