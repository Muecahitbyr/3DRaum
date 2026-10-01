import { bathtubGeometry, hobGeometry, KITCHEN, sinkGeometry } from '../config/furnitureGeometry';
import type { FurnitureSize, FurnitureType } from '../types/furniture';
import { clamp } from './units';

/** Linienzug im lokalen Möbel-Grundriss: [x, z] mit Breite = x, Tiefe = z, Vorderseite +z. */
export type PlanPolyline = [number, number][];

const rect = (x0: number, z0: number, x1: number, z1: number): PlanPolyline => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
  [x0, z0],
];
const seg = (x0: number, z0: number, x1: number, z1: number): PlanPolyline => [
  [x0, z0],
  [x1, z1],
];
const arc = (cx: number, cz: number, rx: number, rz: number, from: number, to: number, steps = 24): PlanPolyline =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz];
  });

/**
 * Anzahl der Fronten (Türen/Fächer) eines Korpusmöbels – gemeinsam für 3D-Modell
 * und Grundriss-Symbol, damit beide übereinstimmen.
 */
export function cabinetFrontCount(type: FurnitureType, width: number): number {
  switch (type) {
    case 'sideboard':
      return clamp(Math.round(width / 0.45), 2, 6);
    case 'tv-board':
      return 3;
    default:
      return 1;
  }
}

/** Front-Linie der Korpusmöbel: kurz hinter der Vorderkante, mit Teilungen der Fronten. */
function cabinetFront(type: FurnitureType, w: number, d: number): PlanPolyline[] {
  const hw = w / 2;
  const front = d / 2 - 0.02;
  const lines = [seg(-hw, front, hw, front)];
  const count = cabinetFrontCount(type, w);
  for (let i = 1; i < count; i++) {
    const x = -hw + (w / count) * i;
    lines.push(seg(x, front, x, d / 2));
  }
  return lines;
}

/**
 * Detaillinien je Möbeltyp (ohne Außenumriss). Grundlage für die 2D-Symbole im
 * Grundriss und die Piktogramme in Listen und Bibliothek.
 */
export function furniturePlanDetails(type: FurnitureType, { width: w, depth: d }: Pick<FurnitureSize, 'width' | 'depth'>): PlanPolyline[] {
  const hw = w / 2;
  const hd = d / 2;
  switch (type) {
    case 'bed':
    case 'double-bed': {
      const head = Math.min(0.06, w * 0.08);
      const x0 = -hw + head;
      const pillowLen = Math.min(0.35, (w - head) * 0.2);
      const blanket = x0 + (w - head) * 0.32;
      const pillows = d > 1.3 ? 2 : 1;
      const pw = (d - 0.12 - (pillows - 1) * 0.06) / pillows;
      // Kopfteil, Deckenkante, umgeschlagene Ecke, Kissen
      const lines: PlanPolyline[] = [seg(x0, -hd, x0, hd), seg(blanket, -hd, blanket, hd)];
      lines.push(seg(blanket, -hd, blanket + Math.min(0.25, d * 0.3), -hd + Math.min(0.25, d * 0.3)));
      for (let i = 0; i < pillows; i++) {
        const z0 = -hd + 0.06 + i * (pw + 0.06);
        lines.push(rect(x0 + 0.04, z0, x0 + 0.04 + pillowLen, z0 + pw));
      }
      return lines;
    }
    case 'wardrobe': {
      // Kleiderstange mit Bügeln, Türfront an der Vorderseite
      const front = hd - 0.02;
      const lines: PlanPolyline[] = [seg(-hw, front, hw, front), seg(-hw + 0.05, -0.02, hw - 0.05, -0.02)];
      const hangers = Math.max(1, Math.floor((w - 0.1) / 0.15));
      const spacing = (w - 0.1) / hangers;
      for (let i = 0; i < hangers; i++) {
        const x = -hw + 0.05 + spacing * (i + 0.5);
        lines.push(seg(x - 0.03, -hd + 0.06, x + 0.03, front - 0.06));
      }
      return lines;
    }
    case 'sofa':
    case 'armchair': {
      const armW = clamp(w * 0.1, 0.1, 0.22);
      const backD = clamp(d * 0.22, 0.12, 0.25);
      const innerW = w - 2 * armW;
      const cushions = innerW > 1.5 ? 3 : innerW > 0.8 ? 2 : 1;
      const lines: PlanPolyline[] = [
        seg(-hw + armW, -hd + backD, hw - armW, -hd + backD),
        seg(-hw + armW, -hd + backD, -hw + armW, hd),
        seg(hw - armW, -hd + backD, hw - armW, hd),
      ];
      for (let i = 1; i < cushions; i++) {
        const x = -innerW / 2 + (innerW / cushions) * i;
        lines.push(seg(x, -hd + backD, x, hd));
      }
      return lines;
    }
    case 'table': {
      const inset = Math.min(0.04, w / 4, d / 4);
      return [rect(-hw + inset, -hd + inset, hw - inset, hd - inset)];
    }
    case 'coffee-table': {
      // Platte mit Ablage darunter (gestrichelt wirkende Doppelkante)
      const a = Math.min(0.03, w / 6, d / 6);
      const b = Math.min(0.08, w / 4, d / 4);
      return [rect(-hw + a, -hd + a, hw - a, hd - a), rect(-hw + b, -hd + b, hw - b, hd - b)];
    }
    case 'tv-board':
    case 'sideboard':
    case 'dresser':
    case 'nightstand':
      return cabinetFront(type, w, d);
    case 'shelf': {
      // Rückwand und Diagonale (übliches Regal-Symbol)
      const back = -hd + 0.02;
      return [seg(-hw, back, hw, back), seg(-hw, back, hw, hd)];
    }
    case 'chair': {
      // Rückenlehne hinten, Sitzfläche
      const backD = Math.min(0.06, d * 0.15);
      const inset = Math.min(0.03, w / 8);
      return [rect(-hw, -hd, hw, -hd + backD), rect(-hw + inset, -hd + backD + inset, hw - inset, hd - inset)];
    }
    case 'office-chair': {
      // Runde Sitzfläche und gebogene Rückenlehne
      const r = Math.min(w, d) * 0.36;
      const back = arc(0, 0.05, hw * 0.78, hd * 0.78, Math.PI * 1.15, Math.PI * 1.85);
      return [arc(0, 0.04, r, r, 0, Math.PI * 2, 32), back];
    }
    case 'ceiling-light':
    case 'pendant-light':
    case 'floor-lamp':
    case 'table-lamp': {
      // Leuchtensymbol: Kreis mit Kreuz (Decke: diagonal, stehend: aufrecht).
      const r = Math.min(hw, hd) * 0.82;
      const k = type === 'ceiling-light' || type === 'pendant-light' ? Math.SQRT1_2 * r : r;
      const lines: PlanPolyline[] = [circle(0, 0, r)];
      if (type === 'ceiling-light' || type === 'pendant-light') lines.push(seg(-k, -k, k, k), seg(-k, k, k, -k));
      else lines.push(seg(-k, 0, k, 0), seg(0, -k, 0, k));
      if (type === 'pendant-light') lines.push(circle(0, 0, r * 0.35));
      return lines;
    }
    case 'desk': {
      // Schubladen-Container rechts, Kante zur Sitzseite
      const pedestal = Math.min(0.42, w * 0.32);
      const front = hd - 0.03;
      return [rect(hw - pedestal, -hd + 0.03, hw - 0.03, front), seg(-hw + 0.03, front, hw - pedestal, front)];
    }
    // ---------- Küche
    case 'kitchen-base':
    case 'kitchen-wall':
      // Front mit Türteilung (Oberschrank: Umriss gestrichelt, siehe FurniturePlanSymbol)
      return kitchenFront(w, d);
    case 'kitchen-sink': {
      const s = sinkGeometry(w, d);
      return [
        ...kitchenFront(w, d),
        rect(-s.basinW / 2, s.basinZ - s.basinD / 2, s.basinW / 2, s.basinZ + s.basinD / 2),
        circle(0, s.basinZ, 0.025, 12),
        seg(0, s.tapZ, 0, s.tapZ + 0.1),
      ];
    }
    case 'kitchen-stove':
      return [...kitchenFront(w, d), ...hobGeometry(w, d).zones.map(([x, z, r]) => circle(x, z, r, 20))];
    case 'kitchen-tall':
      // Hochschrank: Diagonalkreuz (übliche Darstellung raumhoher Schränke)
      return [seg(-hw, -hd, hw, hd), seg(-hw, hd, hw, -hd), ...kitchenFront(w, d)];
    case 'fridge':
      return [seg(-hw, hd - 0.04, hw, hd - 0.04), rect(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.1), seg(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.1)];
    case 'kitchen-island': {
      const overhang = Math.min(KITCHEN.islandOverhang, d * 0.3);
      const lines: PlanPolyline[] = [seg(-hw, -hd + overhang, hw, -hd + overhang), seg(-hw, hd - 0.03, hw, hd - 0.03)];
      const units = Math.max(2, Math.round(w / 0.6));
      for (let i = 1; i < units; i++) lines.push(seg(-hw + (w / units) * i, hd - 0.03, -hw + (w / units) * i, hd));
      return lines;
    }
    // ---------- Bad
    case 'toilet': {
      const tank = Math.min(0.18, d * 0.26);
      const bowlD = d - tank;
      return [rect(-hw, -hd, hw, -hd + tank), ellipse(0, -hd + tank + bowlD / 2, hw - 0.03, bowlD / 2 - 0.02)];
    }
    case 'washbasin':
      return [ellipse(0, 0.03, Math.min(0.24, w * 0.32), Math.min(0.15, d * 0.3)), circle(0, -hd + 0.07, 0.02, 10)];
    case 'shower':
      // Duschtasse: Diagonalkreuz und Ablauf (übliches Symbol)
      return [seg(-hw, -hd, hw, hd), seg(-hw, hd, hw, -hd), circle(0, 0, Math.min(0.05, w / 10), 14)];
    case 'bathtub': {
      const g = bathtubGeometry(w, d);
      const r = Math.min(g.innerD / 2, 0.25);
      return [roundedRect(-g.innerW / 2, -g.innerD / 2, g.innerW / 2, g.innerD / 2, r), circle(hw - g.rim - 0.12, 0, 0.025, 12)];
    }
    // ---------- Einrichtung
    case 'rug': {
      const b = Math.min(0.08, Math.min(w, d) * 0.08);
      const lines: PlanPolyline[] = [rect(-hw + b, -hd + b, hw - b, hd - b)];
      // Fransen an den Schmalseiten
      const fringes = Math.max(3, Math.round(d / 0.12));
      for (let i = 0; i <= fringes; i++) {
        const z = -hd + (d * i) / fringes;
        lines.push(seg(-hw, z, -hw - 0.04, z), seg(hw, z, hw + 0.04, z));
      }
      return lines;
    }
    case 'plant': {
      const r = Math.min(hw, hd);
      const lines: PlanPolyline[] = [circle(0, 0, r * 0.45, 20)];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        lines.push(ellipseRotated(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.42, r * 0.16, a));
      }
      return lines;
    }
  }
}

/** Front einer Küchenzeile: Linie kurz hinter der Vorderkante, Türteilung ab 65 cm Breite. */
function kitchenFront(w: number, d: number): PlanPolyline[] {
  const front = d / 2 - KITCHEN.handle - KITCHEN.front;
  const lines = [seg(-w / 2, front, w / 2, front)];
  if (w > 0.65) lines.push(seg(0, front, 0, d / 2));
  return lines;
}

function ellipse(cx: number, cz: number, rx: number, rz: number, segments = 32): PlanPolyline {
  return arc(cx, cz, rx, rz, 0, Math.PI * 2, segments);
}

/** Gedrehte Ellipse (Blattform der Pflanze). */
function ellipseRotated(cx: number, cz: number, rx: number, rz: number, angle: number, segments = 16): PlanPolyline {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    return [cx + x * Math.cos(angle) - z * Math.sin(angle), cz + x * Math.sin(angle) + z * Math.cos(angle)] as [number, number];
  });
}

/** Rechteck mit abgerundeten Ecken (Wannenmulde). */
function roundedRect(x0: number, z0: number, x1: number, z1: number, r: number): PlanPolyline {
  const corners: [number, number, number][] = [
    [x1 - r, z0 + r, -Math.PI / 2],
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
  ];
  const points = corners.flatMap(([cx, cz, a]) => arc(cx, cz, r, r, a, a + Math.PI / 2, 6));
  return [...points, points[0]];
}

/** Außenumriss (Grundfläche) eines Möbels. */
function circle(cx: number, cz: number, r: number, segments = 28): PlanPolyline {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cz + Math.sin(t) * r] as [number, number];
  });
}

export function furniturePlanOutline({ width, depth }: Pick<FurnitureSize, 'width' | 'depth'>): PlanPolyline {
  return rect(-width / 2, -depth / 2, width / 2, depth / 2);
}
