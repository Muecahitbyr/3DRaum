import { parseProject, PROJECT_FORMAT, PROJECT_FORMAT_VERSION, serializeProject, type ParsedProject } from '../projects/format';
import type { PlanDocument } from '../state/history';

/** Dateiendung der Projektdateien. */
export const PROJECT_FILE_EXTENSION = '.3draum';
/** Größere Dateien sind sicher keine Projektdateien (Schutz vor versehentlichen Uploads). */
export const PROJECT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Dateiname aus dem Projektnamen (ohne unzulässige Zeichen). */
export function safeFileName(name: string, suffix: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 60) || 'Raumplan';
  return `${base}${suffix}`;
}

/** Datei im Browser herunterladen. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Etwas später freigeben – manche Browser starten den Download asynchron.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden.'))), type, quality);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Bild konnte nicht erzeugt werden.'));
    }
  });
}

/** Projektdatei (gleiches, versioniertes Format wie im lokalen Speicher). */
export function projectFileBlob(name: string, plan: PlanDocument, createdAt?: string): Blob {
  const now = new Date().toISOString();
  const text = serializeProject({
    format: PROJECT_FORMAT,
    version: PROJECT_FORMAT_VERSION,
    id: 'export',
    name,
    createdAt: createdAt ?? now,
    updatedAt: now,
    plan,
  });
  return new Blob([text], { type: 'application/json' });
}

/**
 * Projektdatei lesen und vollständig prüfen (Format, Version, Migration, Geometrie).
 * Der laufende Plan wird dabei nicht angetastet.
 */
export async function readProjectFile(file: File): Promise<ParsedProject> {
  if (file.size > PROJECT_FILE_MAX_BYTES) return { ok: false, error: 'Die Datei ist zu groß für eine Projektdatei.' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: 'Die Datei konnte nicht gelesen werden.' };
  }
  let result: ParsedProject;
  try {
    result = parseProject(text);
  } catch {
    return { ok: false, error: 'Die Datei ist beschädigt.' };
  }
  return result;
}
