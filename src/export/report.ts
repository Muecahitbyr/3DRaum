import { FURNITURE_CATALOG } from '../config/furniture';
import { OPENING_TYPE_LABELS } from '../config/openings';
import { ROOM_SHAPE_LABELS } from '../config/room';
import { LIGHTING_PRESETS, FLOOR_MATERIALS } from '../config/design';
import type { PlanDocument } from '../state/history';
import { signedArea } from '../utils/polygon';
import type { RoomModel } from '../utils/room/model';
import { formatNumber } from '../utils/units';
import { A4, canvasToPdfImage, fitText, PdfDocument, type PdfPage } from './pdf';

const MARGIN = 42;
const MUTED: [number, number, number] = [0.42, 0.45, 0.5];
const ACCENT: [number, number, number] = [0.15, 0.39, 0.92];

interface ReportInput {
  projectName: string;
  date: Date;
  plan: PlanDocument;
  room: RoomModel;
  planImage: HTMLCanvasElement;
  /** 3D-Vorschau; fehlt sie (z. B. ohne WebGL), entfällt der Abschnitt. */
  previewImage: HTMLCanvasElement | null;
}

const m = (v: number) => `${formatNumber(v, 2)} m`;
const cm = (v: number) => formatNumber(Math.round(v * 100), 0);

/**
 * Planungsbericht: Titel, Datum, Grundriss, 3D-Vorschau, Raumdaten und
 * Möbelübersicht (Name, Typ, Maße). Tabelle bricht bei Bedarf auf Folgeseiten um.
 */
export async function buildReport(input: ReportInput): Promise<Blob> {
  const { plan, room } = input;
  const pdf = new PdfDocument();
  const planImage = pdf.addImage(await canvasToPdfImage(input.planImage, 2200));
  const previewImage = input.previewImage ? pdf.addImage(await canvasToPdfImage(input.previewImage, 1800, 0.88)) : null;
  const width = A4.width - 2 * MARGIN;

  // ---------- Seite 1: Titel, Raumdaten, Grundriss
  let page = pdf.addPage();
  header(page, input);
  let y = 104;
  page.text(MARGIN, y, 'Raumdaten', 12, true);
  y += 20;
  const area = Math.abs(signedArea(room.polygon));
  const perimeter = room.walls.reduce((sum, w) => sum + w.length, 0);
  const facts: [string, string][] = [
    ['Raumform', `${ROOM_SHAPE_LABELS[room.plan.shape]} · ${room.walls.length} Wände`],
    ['Grundfläche', `${formatNumber(area, 2)} m²`],
    ['Umriss (Hülle)', `${m(room.dimensions.width)} × ${m(room.dimensions.length)}`],
    ['Raumhöhe', m(room.dimensions.height)],
    ['Wandlängen gesamt', m(perimeter)],
    ['Türen / Fenster', `${plan.openings.filter((o) => o.type === 'door').length} / ${plan.openings.filter((o) => o.type === 'window').length}`],
    ['Boden', FLOOR_MATERIALS[plan.design.floor].label],
    ['Licht', `${LIGHTING_PRESETS[plan.design.lighting.preset].label}, ${Math.round(plan.design.lighting.brightness * 100)} %`],
  ];
  facts.forEach(([label, value], i) => {
    const col = i % 2;
    const x = MARGIN + col * (width / 2);
    const row = Math.floor(i / 2);
    page.text(x, y + row * 16, label, 9, false, MUTED);
    page.text(x + 110, y + row * 16, value, 9, true);
  });
  y += Math.ceil(facts.length / 2) * 16 + 16;
  page.text(MARGIN, y, 'Grundriss', 12, true);
  y += 18;
  y = placeImage(page, planImage, input.planImage, y, width, A4.height - MARGIN - 20 - y);
  footer(page, 1);

  // ---------- Seite 2: 3D-Vorschau + Möbelübersicht
  page = pdf.addPage();
  header(page, input);
  y = 104;
  let pageNumber = 2;
  if (previewImage !== null && input.previewImage) {
    page.text(MARGIN, y, '3D-Vorschau', 12, true);
    y += 18;
    y = placeImage(page, previewImage, input.previewImage, y, width, 300) + 22;
  }
  page.text(MARGIN, y, `Möbel und Lampen (${plan.furniture.length})`, 12, true);
  y += 20;
  const columns = [
    { title: 'Name', x: 0, w: 170 },
    { title: 'Typ', x: 170, w: 120 },
    { title: 'Breite × Tiefe × Höhe (cm)', x: 290, w: 140 },
    { title: 'Position X / Z (m)', x: 430, w: width - 430 },
  ];
  const tableHeader = () => {
    page.rect(MARGIN, y - 4, width, 18, { fill: [0.95, 0.96, 0.97] });
    columns.forEach((c) => page.text(MARGIN + c.x + 4, y, c.title, 8.5, true, MUTED));
    y += 20;
  };
  tableHeader();
  if (plan.furniture.length === 0) {
    page.text(MARGIN + 4, y, 'Noch keine Möbel geplant.', 9, false, MUTED);
  }
  for (const item of plan.furniture) {
    if (y > A4.height - MARGIN - 30) {
      footer(page, pageNumber);
      page = pdf.addPage();
      pageNumber++;
      header(page, input);
      y = 104;
      tableHeader();
    }
    const cells = [
      item.name,
      FURNITURE_CATALOG[item.type].label,
      `${cm(item.width)} × ${cm(item.depth)} × ${cm(item.height)}`,
      `${formatNumber(item.position.x, 2)} / ${formatNumber(item.position.z, 2)}`,
    ];
    cells.forEach((text, i) => page.text(MARGIN + columns[i].x + 4, y, fitText(text, 9, columns[i].w - 8), 9));
    page.line(MARGIN, y + 13, MARGIN + width, y + 13, [0.9, 0.91, 0.93], 0.5);
    y += 17;
  }
  if (plan.openings.length) {
    y += 14;
    if (y > A4.height - MARGIN - 60) {
      footer(page, pageNumber);
      page = pdf.addPage();
      pageNumber++;
      header(page, input);
      y = 104;
    }
    page.text(MARGIN, y, 'Türen und Fenster', 12, true);
    y += 18;
    const counts = new Map<string, number>();
    for (const o of plan.openings) {
      const n = (counts.get(o.type) ?? 0) + 1;
      counts.set(o.type, n);
      const wall = room.wallById.get(o.wall);
      const detail = o.type === 'window' ? `Brüstung ${cm(o.sillHeight)} cm` : `Anschlag ${o.hinge === 'left' ? 'links' : 'rechts'}, öffnet nach ${o.swing === 'inward' ? 'innen' : 'außen'}`;
      page.text(MARGIN + 4, y, fitText(`${OPENING_TYPE_LABELS[o.type]} ${n} · ${wall?.label ?? ''} · ${cm(o.width)} × ${cm(o.height)} cm · ${detail}`, 9, width - 8), 9);
      y += 15;
      if (y > A4.height - MARGIN - 20) break;
    }
  }
  footer(page, pageNumber);

  const bytes = pdf.build();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

function header(page: PdfPage, input: ReportInput) {
  page.rect(0, 0, A4.width, 6, { fill: ACCENT });
  page.text(MARGIN, 34, 'Planungsbericht', 9, true, ACCENT);
  page.text(MARGIN, 48, fitText(input.projectName, 20, A4.width - 2 * MARGIN - 120, true), 20, true);
  const date = input.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  page.text(A4.width - MARGIN - 110, 34, `Datum: ${date}`, 9, false, MUTED);
  page.line(MARGIN, 82, A4.width - MARGIN, 82);
}

function footer(page: PdfPage, pageNumber: number) {
  page.text(MARGIN, A4.height - 30, '3D-Raumplaner', 8, false, MUTED);
  page.text(A4.width - MARGIN - 40, A4.height - 30, `Seite ${pageNumber}`, 8, false, MUTED);
}

/** Bild einpassen (Seitenverhältnis erhalten), mit dünnem Rahmen; liefert die neue y-Position. */
function placeImage(page: PdfPage, image: number, source: HTMLCanvasElement, y: number, maxWidth: number, maxHeight: number): number {
  const k = Math.min(maxWidth / source.width, maxHeight / source.height);
  const w = source.width * k;
  const h = source.height * k;
  const x = MARGIN + (maxWidth - w) / 2;
  page.image(image, x, y, w, h);
  page.rect(x, y, w, h, { stroke: [0.85, 0.87, 0.9], lineWidth: 0.5 });
  return y + h;
}
