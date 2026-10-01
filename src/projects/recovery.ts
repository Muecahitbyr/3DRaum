import { sameDocument, type PlanDocument } from '../state/history';
import { DEFAULT_PLAN, parseProject, PROJECT_FORMAT, PROJECT_FORMAT_VERSION, serializeProject, type ProjectFile } from './format';
import { describeStorageError, STORAGE_UNAVAILABLE, storage, type StorageResult } from './storage';

/**
 * Wiederherstellungsentwurf (Autosave): eine zusätzliche, vom eigentlichen Projekt getrennte
 * Sicherung des aktuellen Plans. Normales Speichern bleibt bewusst manuell – „ungespeichert“
 * zeigt weiterhin den Vergleich mit dem gespeicherten Projekt.
 *
 * Inhalt: vollständiges Projekt im normalen Projektformat (Name, Plan, Formatversion – damit
 * gelten dieselben Migrationen und Prüfungen), Zeitpunkt der Sicherung und das gespeicherte
 * Projekt, auf dem der Entwurf beruht (`null` = noch nie gespeichert). Ein eigener Schlüssel,
 * daher nie in der Projektliste und nie in Exporten.
 */

const RECOVERY_KEY = 'raumplaner:recovery';
export const RECOVERY_FORMAT = 'raumplaner-recovery';

export interface RecoveryBase {
  id: string;
  /** Zeitpunkt der letzten Speicherung dieses Projekts (ISO). */
  updatedAt: string;
}

export interface RecoveryDraft {
  /** Zeitpunkt der Sicherung (ISO). */
  savedAt: string;
  base: RecoveryBase | null;
  project: ProjectFile;
}

export type ParsedRecovery =
  | { ok: true; draft: RecoveryDraft; warnings: string[] }
  | { ok: false; reason: 'empty' | 'corrupt' | 'future'; error: string };

/** Entwurf aus dem aktuellen Plan (ID „entwurf“, solange das Projekt nie gespeichert wurde). */
export function createRecoveryDraft(plan: PlanDocument, name: string, base: RecoveryBase | null, now = new Date()): RecoveryDraft {
  const savedAt = now.toISOString();
  return {
    savedAt,
    base,
    project: {
      format: PROJECT_FORMAT,
      version: PROJECT_FORMAT_VERSION,
      id: base?.id ?? 'entwurf',
      name,
      createdAt: savedAt,
      updatedAt: savedAt,
      plan: { room: plan.room, openings: plan.openings, furniture: plan.furniture, fixtures: plan.fixtures, groups: plan.groups, design: plan.design },
    },
  };
}

export function serializeRecovery(draft: RecoveryDraft): string {
  return JSON.stringify({ format: RECOVERY_FORMAT, savedAt: draft.savedAt, base: draft.base, project: JSON.parse(serializeProject(draft.project)) });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * Entwurf lesen und prüfen – wirft nie. Der Plan läuft durch denselben Parser wie
 * Projektdateien: alte Versionen werden migriert, neuere verständlich abgelehnt.
 */
export function parseRecovery(raw: string | null): ParsedRecovery {
  if (raw === null) return { ok: false, reason: 'empty', error: 'Kein Entwurf vorhanden.' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt', error: 'Der Wiederherstellungsentwurf ist beschädigt.' };
  }
  if (!isObject(data) || data.format !== RECOVERY_FORMAT || !isIso(data.savedAt)) {
    return { ok: false, reason: 'corrupt', error: 'Der Wiederherstellungsentwurf ist beschädigt.' };
  }
  const base = data.base === null ? null : isObject(data.base) && typeof data.base.id === 'string' && isIso(data.base.updatedAt) ? { id: data.base.id, updatedAt: data.base.updatedAt } : undefined;
  if (base === undefined) return { ok: false, reason: 'corrupt', error: 'Der Wiederherstellungsentwurf ist beschädigt.' };
  const parsed = parseProject(JSON.stringify(data.project));
  if (!parsed.ok) {
    const future = parsed.error.includes('neueren Version');
    return { ok: false, reason: future ? 'future' : 'corrupt', error: future ? 'Der Entwurf stammt aus einer neueren Version des Raumplaners.' : 'Der Wiederherstellungsentwurf ist beschädigt.' };
  }
  return { ok: true, draft: { savedAt: new Date(data.savedAt).toISOString(), base, project: parsed.project }, warnings: parsed.warnings };
}

/**
 * Lohnt die Wiederherstellung? Nein, wenn der Entwurf nichts Neues enthält: gleicher Plan wie
 * das gespeicherte Projekt (bzw. der leere Standardplan) oder das Projekt wurde später
 * gespeichert als der Entwurf entstand (z. B. in einem anderen Tab).
 */
export function recoveryIsRelevant(draft: RecoveryDraft, saved: ProjectFile | null): boolean {
  const plan = draft.project.plan;
  if (draft.base && saved) {
    if (Date.parse(saved.updatedAt) > Date.parse(draft.savedAt)) return false;
    return !sameDocument(saved.plan, plan);
  }
  return !sameDocument(DEFAULT_PLAN, plan);
}

export function readRecovery(): ParsedRecovery {
  const store = storage();
  if (!store) return { ok: false, reason: 'empty', error: STORAGE_UNAVAILABLE };
  try {
    return parseRecovery(store.getItem(RECOVERY_KEY));
  } catch {
    return { ok: false, reason: 'empty', error: STORAGE_UNAVAILABLE };
  }
}

export function writeRecovery(draft: RecoveryDraft): StorageResult<void> {
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  try {
    store.setItem(RECOVERY_KEY, serializeRecovery(draft));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: describeStorageError(error) };
  }
}

/** Entwurf entfernen (sauber gespeichert, verworfen oder unbrauchbar). Fehler sind hier egal. */
export function clearRecovery(): void {
  try {
    storage()?.removeItem(RECOVERY_KEY);
  } catch {
    /* Speicher gesperrt – nichts zu tun */
  }
}

export function hasRecovery(): boolean {
  try {
    return storage()?.getItem(RECOVERY_KEY) != null;
  } catch {
    return false;
  }
}
