/**
 * Minimaler PDF-Schreiber (ohne Bibliothek): A4-Seiten mit Text (Helvetica,
 * WinAnsi – deckt deutsche Umlaute und ß ab), Linien/Flächen und JPEG-Bildern
 * (DCTDecode, die Bilddaten werden unverändert eingebettet). Mehr braucht der
 * Planungsbericht nicht – eine PDF-Bibliothek wäre um ein Vielfaches größer.
 */

export const A4 = { width: 595.28, height: 841.89 } as const;

export interface PdfImage {
  /** JPEG-Bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

type Op =
  | { kind: 'text'; x: number; y: number; size: number; text: string; bold: boolean; color: [number, number, number] }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: [number, number, number]; stroke?: [number, number, number]; lineWidth?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: [number, number, number]; lineWidth: number }
  | { kind: 'image'; image: number; x: number; y: number; w: number; h: number };

/** Koordinaten in Punkt, Ursprung oben links (wird intern umgerechnet). */
export class PdfPage {
  readonly ops: Op[] = [];
  text(x: number, y: number, text: string, size = 10, bold = false, color: [number, number, number] = [0.1, 0.12, 0.15]) {
    this.ops.push({ kind: 'text', x, y, size, text, bold, color });
    return this;
  }
  rect(x: number, y: number, w: number, h: number, style: { fill?: [number, number, number]; stroke?: [number, number, number]; lineWidth?: number }) {
    this.ops.push({ kind: 'rect', x, y, w, h, ...style });
    return this;
  }
  line(x1: number, y1: number, x2: number, y2: number, color: [number, number, number] = [0.8, 0.82, 0.85], lineWidth = 0.6) {
    this.ops.push({ kind: 'line', x1, y1, x2, y2, color, lineWidth });
    return this;
  }
  image(image: number, x: number, y: number, w: number, h: number) {
    this.ops.push({ kind: 'image', image, x, y, w, h });
    return this;
  }
}

/** Ungefähre Textbreite (Helvetica) in Punkt – für Umbruch/Kürzen in Tabellen. */
export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += /[il.,:;'|!]/.test(ch) ? 250 : /[mwMW]/.test(ch) ? 830 : /[A-ZÄÖÜ]/.test(ch) ? 660 : /\d/.test(ch) ? 556 : ch === ' ' ? 278 : 520;
  return (units / 1000) * size * (bold ? 1.05 : 1);
}

/** Text so kürzen, dass er in `maxWidth` passt (mit „…“). */
export function fitText(text: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

const encoder = new TextEncoder();

/** Zeichen in WinAnsi (CP1252) als PDF-String mit Escapes. */
function pdfString(text: string): Uint8Array {
  const special: Record<string, number> = { '€': 0x80, '–': 0x96, '—': 0x97, '„': 0x84, '“': 0x93, '”': 0x94, '…': 0x85, '‚': 0x82, '‘': 0x91, '’': 0x92, '•': 0x95 };
  const bytes: number[] = [0x28];
  for (const ch of text) {
    let code = special[ch] ?? ch.codePointAt(0)!;
    if (code > 0xff) code = 0x3f; // „?“ für nicht darstellbare Zeichen
    if (code === 0x28 || code === 0x29 || code === 0x5c) bytes.push(0x5c);
    bytes.push(code);
  }
  bytes.push(0x29);
  return new Uint8Array(bytes);
}

const num = (v: number) => (Math.round(v * 100) / 100).toString();
const rgb = ([r, g, b]: [number, number, number]) => `${num(r)} ${num(g)} ${num(b)}`;

export class PdfDocument {
  private pages: PdfPage[] = [];
  private images: PdfImage[] = [];

  addPage(): PdfPage {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  addImage(image: PdfImage): number {
    this.images.push(image);
    return this.images.length - 1;
  }

  /** PDF-Datei als Bytes. */
  build(): Uint8Array {
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let length = 0;
    const write = (part: string | Uint8Array) => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };
    // Objektnummern: 1 Katalog, 2 Seitenbaum, 3/4 Schriften, dann Bilder, dann je Seite Inhalt + Seite.
    const imageBase = 5;
    const pageBase = imageBase + this.images.length;
    const pageObject = (i: number) => pageBase + i * 2 + 1;
    const contentObject = (i: number) => pageBase + i * 2;
    const total = pageBase + this.pages.length * 2;
    const object = (id: number, body: (string | Uint8Array)[]) => {
      offsets[id] = length;
      write(`${id} 0 obj\n`);
      body.forEach(write);
      write('\nendobj\n');
    };

    write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2, [`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageObject(i)} 0 R`).join(' ')}] /Count ${this.pages.length} >>`]);
    object(3, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    object(4, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    this.images.forEach((image, i) => {
      object(imageBase + i, [
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`,
        image.data,
        '\nendstream',
      ]);
    });
    this.pages.forEach((page, i) => {
      const H = A4.height;
      const parts: (string | Uint8Array)[] = [];
      for (const op of page.ops) {
        switch (op.kind) {
          case 'text':
            parts.push(`BT /${op.bold ? 'F2' : 'F1'} ${num(op.size)} Tf ${rgb(op.color)} rg ${num(op.x)} ${num(H - op.y - op.size)} Td `, pdfString(op.text), ' Tj ET\n');
            break;
          case 'rect': {
            const cmd = op.fill && op.stroke ? 'B' : op.fill ? 'f' : 'S';
            parts.push(`${op.fill ? `${rgb(op.fill)} rg ` : ''}${op.stroke ? `${rgb(op.stroke)} RG ${num(op.lineWidth ?? 0.6)} w ` : ''}${num(op.x)} ${num(H - op.y - op.h)} ${num(op.w)} ${num(op.h)} re ${cmd}\n`);
            break;
          }
          case 'line':
            parts.push(`${rgb(op.color)} RG ${num(op.lineWidth)} w ${num(op.x1)} ${num(H - op.y1)} m ${num(op.x2)} ${num(H - op.y2)} l S\n`);
            break;
          case 'image':
            parts.push(`q ${num(op.w)} 0 0 ${num(op.h)} ${num(op.x)} ${num(H - op.y - op.h)} cm /Im${op.image} Do Q\n`);
            break;
        }
      }
      const content = concat(parts.map((p) => (typeof p === 'string' ? encoder.encode(p) : p)));
      object(contentObject(i), [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
      const xobjects = this.images.map((_, k) => `/Im${k} ${imageBase + k} 0 R`).join(' ');
      object(pageObject(i), [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >> /Contents ${contentObject(i)} 0 R >>`,
      ]);
    });
    const xref = length;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let id = 1; id < total; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    write(table);
    write(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return concat(chunks);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Canvas → JPEG für das PDF (weißer Hintergrund, da JPEG keine Transparenz kennt). */
export async function canvasToPdfImage(source: HTMLCanvasElement, maxSize = 2000, quality = 0.9): Promise<PdfImage> {
  const k = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * k);
  canvas.height = Math.round(source.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Zeichenfläche nicht verfügbar.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden.');
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}
