import type { FloorPoint, Meters, WallDimension } from '../../types/room';
import { layoutChainLabels, type ChainSegment, type LabelPlacement } from './measurements';

/**
 * Beschriftung aller Wandmaße eines Raums – gemeinsam für Live-Grundriss und Bildexport.
 * Innerhalb einer Wand verteilt `layoutChainLabels` die Kettenmaße; hier kommt die Sicht
 * über alle Wände hinzu: An Innenecken (L-Form) laufen die Maße zweier Wände in denselben
 * Bereich. Reihenfolge der Wichtigkeit: Gesamtmaße (immer sichtbar, weichen entlang ihrer
 * Maßlinie aus), danach Kettenmaße (weichen auf die zweite Spur aus oder entfallen).
 *
 * Alle Größen in Bildschirm- bzw. Bildeinheiten („px“); Lagen der Etiketten in Metern
 * entlang der Wand (Leserichtung) und senkrecht dazu ab der Wand-Innenfläche.
 */

export interface LabelSize {
  w: number;
  h: number;
}

export interface DimensionLayoutOptions {
  /** Maßstab: Einheiten (px) je Meter. */
  pxPerMeter: number;
  /** Abstände jenseits der Wand-Außenkante (px). */
  offsets: { overall: number; overallWithChain: number; chain: number; lane: number };
  /** Mindestluft zwischen zwei Etiketten (px). */
  gap: number;
  overallText: (length: Meters) => string;
  chainText: (length: Meters) => string;
  /** Größe eines ungedrehten Etiketts (px). */
  overallSize: (text: string) => LabelSize;
  chainSize: (text: string) => LabelSize;
}

export interface DimensionLabel {
  text: string;
  /** Lage entlang der Wand in Leserichtung (m ab Anfang). */
  along: Meters;
  /** Abstand senkrecht ab der Wand-Innenfläche nach außen (m). */
  offset: Meters;
}

export interface ChainLabel extends DimensionLabel {
  segment: ChainSegment;
  placement: Exclude<LabelPlacement, 'hidden'>;
}

export interface WallDimensionLayout {
  /** Lage der Maßlinien ab der Wand-Innenfläche (m). */
  overallOffset: Meters;
  chainOffset: Meters | null;
  overall: DimensionLabel;
  /** Nur sichtbare Kettenbeschriftungen. */
  chain: ChainLabel[];
}

/** Etikett als gedrehtes Rechteck: Mitte, Achse entlang der Wand (u), halbe Breite/Höhe. */
interface Box {
  x: number;
  y: number;
  u: FloorPoint;
  hw: number;
  hh: number;
}

/**
 * Überdecken sich zwei gedrehte Etiketten (mit Mindestluft)? Trennachsen-Test über die
 * Kanten beider Rechtecke – genau auch bei schrägen Wänden, wo achsparallele Hüllen viel
 * zu groß wären.
 */
function overlaps(a: Box, b: Box, gap: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const axis of [a.u, { x: -a.u.z, z: a.u.x }, b.u, { x: -b.u.z, z: b.u.x }]) {
    const radius = (box: Box) => box.hw * Math.abs(box.u.x * axis.x + box.u.z * axis.z) + box.hh * Math.abs(-box.u.z * axis.x + box.u.x * axis.z);
    if (Math.abs(dx * axis.x + dy * axis.z) >= radius(a) + radius(b) + gap) return false;
  }
  return true;
}

/** Wandrichtung (Leserichtung) als Einheitsvektor. */
const directionOf = (d: WallDimension): FloorPoint => ({ x: (d.end.x - d.start.x) / d.length, z: (d.end.z - d.start.z) / d.length });

/** Punkt auf einer Maßlinie: `along` ab Anfang (Leserichtung), `offset` ab Wand-Innenfläche nach außen. */
export function dimensionPoint(d: WallDimension, along: Meters, offset: Meters): FloorPoint {
  const dir = directionOf(d);
  return { x: d.start.x + dir.x * along + d.outwardNormal.x * offset, z: d.start.z + dir.z * along + d.outwardNormal.z * offset };
}

/** Etikett entlang der Wand gedreht (Text ist nie auf dem Kopf; die Richtung spielt für die Fläche keine Rolle). */
function boxAt(d: WallDimension, along: Meters, offset: Meters, size: LabelSize, pxPerMeter: number): Box {
  const p = dimensionPoint(d, along, offset);
  return { x: p.x * pxPerMeter, y: p.z * pxPerMeter, u: directionOf(d), hw: size.w / 2, hh: size.h / 2 };
}

export function layoutRoomDimensions(
  dimensions: readonly WallDimension[],
  chains: readonly (readonly ChainSegment[] | null)[],
  options: DimensionLayoutOptions,
): WallDimensionLayout[] {
  const { pxPerMeter: k, offsets, gap } = options;
  const placed: Box[] = [];
  const free = (box: Box) => placed.every((other) => !overlaps(box, other, gap));

  // 1. Gesamtmaße: bevorzugt mittig, sonst entlang der eigenen Maßlinie verschoben.
  const result = dimensions.map((d, i) => {
    const chain = chains[i];
    const overallOffset = d.wallThickness + (chain ? offsets.overallWithChain : offsets.overall) / k;
    const text = options.overallText(d.length);
    const size = options.overallSize(text);
    const halfAlong = (Math.abs(directionOf(d).x) * size.w + Math.abs(directionOf(d).z) * size.h) / 2 / k;
    const room = Math.max(0, d.length / 2 - halfAlong);
    const candidates = [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9].map((t) => d.length / 2 + t * room);
    let along = candidates[0];
    for (const candidate of candidates) {
      if (free(boxAt(d, candidate, overallOffset, size, k))) {
        along = candidate;
        break;
      }
    }
    placed.push(boxAt(d, along, overallOffset, size, k));
    return { overallOffset, chainOffset: chain ? d.wallThickness + offsets.chain / k : null, overall: { text, along, offset: overallOffset }, chain: [] as ChainLabel[] };
  });

  // 2. Kettenmaße: Verteilung je Wand, dann wandübergreifend ohne Überdeckung.
  dimensions.forEach((d, i) => {
    const chain = chains[i];
    if (!chain) return;
    const texts = chain.map((s) => options.chainText(s.length));
    const sizes = texts.map(options.chainSize);
    const slots = layoutChainLabels(
      chain.map((s) => ({ from: s.from * k, to: s.to * k })),
      sizes.map((s) => s.w),
      gap,
    );
    const lineOffset = d.wallThickness + offsets.chain / k;
    const laneOffset = d.wallThickness + offsets.lane / k;
    chain.forEach((segment, j) => {
      const slot = slots[j];
      if (slot.placement === 'hidden') return;
      const along = slot.center / k;
      const choices: { placement: ChainLabel['placement']; along: Meters; offset: Meters }[] =
        slot.placement === 'inline'
          ? [
              { placement: 'inline', along, offset: lineOffset },
              { placement: 'outside', along, offset: laneOffset },
            ]
          : [{ placement: 'outside', along, offset: laneOffset }];
      for (const choice of choices) {
        const box = boxAt(d, choice.along, choice.offset, sizes[j], k);
        if (!free(box)) continue;
        placed.push(box);
        result[i].chain.push({ text: texts[j], segment, ...choice });
        return;
      }
    });
  });
  return result;
}
