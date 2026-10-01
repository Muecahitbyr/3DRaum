import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { WallFinish } from '../../../types/design';

/**
 * Prozedurale Wandoberflächen (einmal erzeugt, zwischengespeichert). Die Farbtextur
 * ist ein heller Graustufen-Schleier, der mit der Wandfarbe multipliziert wird –
 * die gewählte Farbe bleibt maßgeblich. Matt braucht keine Textur.
 */

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kachelbares Wertrauschen mit mehreren Oktaven (0..1). */
function noise(size: number, octaves: [cells: number, weight: number][], seed: number): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(size * size);
  const total = octaves.reduce((sum, [, w]) => sum + w, 0);
  for (const [cells, weight] of octaves) {
    const grid = Float32Array.from({ length: cells * cells }, rng);
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy);
      const ty = (gy - y0) * (gy - y0) * (3 - 2 * (gy - y0));
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx);
        const tx = (gx - x0) * (gx - x0) * (3 - 2 * (gx - x0));
        const a = grid[y0 * cells + x0] + (grid[y0 * cells + ((x0 + 1) % cells)] - grid[y0 * cells + x0]) * tx;
        const b = grid[((y0 + 1) % cells) * cells + x0] + (grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)] - grid[((y0 + 1) % cells) * cells + x0]) * tx;
        out[y * size + x] += ((a + (b - a) * ty) * weight) / total;
      }
    }
  }
  return out;
}

function toCanvas(size: number, values: Float32Array, map: (v: number) => number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  const ctx = element.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(map(values[i]));
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return element;
}

export interface WallTextures {
  map: CanvasTexture;
  bump: CanvasTexture;
}

/**
 * Fliesen (4 × 4 je Kachel): helle Flächen mit minimaler Tonwertstreuung je Fliese und
 * dunklerer, im Relief vertiefter Fuge. Farbe weiterhin aus der Wandfarbe (multipliziert).
 */
function tileCanvases(size: number): { color: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const tiles = 4;
  const cell = size / tiles;
  const grout = Math.max(2, Math.round(size / 128));
  const rng = mulberry32(211);
  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = size;
  const c = color.getContext('2d')!;
  const b = bump.getContext('2d')!;
  c.fillStyle = 'rgb(196,196,196)';
  c.fillRect(0, 0, size, size);
  b.fillStyle = 'rgb(0,0,0)';
  b.fillRect(0, 0, size, size);
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const v = Math.round(244 + (rng() - 0.5) * 10);
      c.fillStyle = `rgb(${v},${v},${v})`;
      // Fuge halbiert an den Kachelrändern – beim Kacheln ergibt sich eine durchgehende Fuge.
      c.fillRect(i * cell + grout / 2, j * cell + grout / 2, cell - grout, cell - grout);
      b.fillStyle = 'rgb(255,255,255)';
      b.fillRect(i * cell + grout / 2, j * cell + grout / 2, cell - grout, cell - grout);
    }
  }
  return { color, bump };
}

const cache = new Map<WallFinish, WallTextures | null>();

/** Texturen einer Oberfläche (`null` für Matt). */
export function getWallTextures(finish: WallFinish): WallTextures | null {
  if (cache.has(finish)) return cache.get(finish)!;
  let result: WallTextures | null = null;
  if (finish === 'tiles') {
    const { color, bump } = tileCanvases(256);
    const map = new CanvasTexture(color);
    map.colorSpace = SRGBColorSpace;
    const bumpMap = new CanvasTexture(bump);
    for (const texture of [map, bumpMap]) {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
    }
    result = { map, bump: bumpMap };
  } else if (finish !== 'matte') {
    const size = 256;
    const values =
      finish === 'plaster'
        ? noise(size, [[32, 0.25], [128, 0.75]], 101)
        : noise(size, [[3, 0.45], [9, 0.3], [40, 0.15], [128, 0.1]], 107);
    // Farbe: sehr helle Graustufen (Putz fast gleichmäßig, Beton mit Wolken).
    const color = toCanvas(size, values, finish === 'plaster' ? (v) => 236 + v * 19 : (v) => 196 + v * 59);
    const bump = toCanvas(size, values, (v) => v * 255);
    const map = new CanvasTexture(color);
    map.colorSpace = SRGBColorSpace;
    const bumpMap = new CanvasTexture(bump);
    for (const texture of [map, bumpMap]) {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
    }
    result = { map, bump: bumpMap };
  }
  cache.set(finish, result);
  return result;
}
