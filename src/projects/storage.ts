import type { PlanDocument } from '../state/history';
import {
  cleanProjectName,
  parseProject,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  serializeProject,
  type ParsedProject,
  type ProjectFile,
} from './format';

/** Jedes Projekt liegt unter einem eigenen Schlüssel – ein beschädigtes Projekt betrifft nur sich selbst. */
const KEY_PREFIX = 'raumplaner:project:';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string | null;
  /** `false`: Daten beschädigt oder aus neuerer Version – nur Löschen möglich. */
  valid: boolean;
  error?: string;
}

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const STORAGE_UNAVAILABLE = 'Der lokale Speicher des Browsers ist nicht verfügbar.';

/** Zugriff auf localStorage (`null`, wenn gesperrt oder nicht vorhanden). */
export function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Verständlicher Fehlertext für Schreibfehler (Speicher voll, gesperrt …). */
export function describeStorageError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
    return 'Der lokale Speicher ist voll. Bitte nicht mehr benötigte Projekte löschen.';
  }
  return 'Speichern im Browser nicht möglich.';
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const keyOf = (id: string) => `${KEY_PREFIX}${id}`;

/** Alle Projekte, zuletzt geänderte zuerst. Beschädigte Einträge erscheinen markiert, statt zu stören. */
export function listProjects(): StorageResult<ProjectSummary[]> {
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  try {
    const summaries: ProjectSummary[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const id = key.slice(KEY_PREFIX.length);
      const parsed = parseProject(store.getItem(key));
      summaries.push(
        parsed.ok
          ? { id, name: parsed.project.name, updatedAt: parsed.project.updatedAt, valid: true }
          : { id, name: parsed.name ?? 'Unbekanntes Projekt', updatedAt: null, valid: false, error: parsed.error },
      );
    }
    summaries.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.name.localeCompare(b.name));
    return { ok: true, value: summaries };
  } catch {
    return { ok: false, error: STORAGE_UNAVAILABLE };
  }
}

export function loadProject(id: string): ParsedProject {
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  try {
    const parsed = parseProject(store.getItem(keyOf(id)));
    // Die ID ist der Speicherschlüssel; eine abweichende ID in der Datei wird angeglichen.
    return parsed.ok ? { ...parsed, project: { ...parsed.project, id } } : parsed;
  } catch {
    return { ok: false, error: STORAGE_UNAVAILABLE };
  }
}

interface SaveInput {
  /** Fehlt die ID, wird ein neues Projekt angelegt. */
  id?: string;
  name: string;
  plan: PlanDocument;
}

export function saveProject({ id, name, plan }: SaveInput): StorageResult<ProjectFile> {
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  const now = new Date().toISOString();
  const projectId = id ?? newId();
  let createdAt = now;
  if (id) {
    const existing = loadProject(id);
    if (existing.ok) createdAt = existing.project.createdAt;
  }
  const project: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_FORMAT_VERSION,
    id: projectId,
    name: cleanProjectName(name),
    createdAt,
    updatedAt: now,
    // Nur Plandaten – keine Auswahl-, Ansichts- oder Kamerazustände.
    plan: {
      room: plan.room,
      openings: plan.openings,
      furniture: plan.furniture,
      fixtures: plan.fixtures,
      groups: plan.groups,
      design: plan.design,
    },
  };
  try {
    store.setItem(keyOf(projectId), serializeProject(project));
    return { ok: true, value: project };
  } catch (error) {
    return { ok: false, error: describeStorageError(error) };
  }
}

/** Benennt ein Projekt um; der Plan bleibt unverändert (auch bei nicht lesbarem Plan kein Datenverlust). */
export function renameProject(id: string, name: string): StorageResult<string> {
  const parsed = loadProject(id);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  const cleaned = cleanProjectName(name);
  try {
    store.setItem(keyOf(id), serializeProject({ ...parsed.project, name: cleaned, updatedAt: new Date().toISOString() }));
    return { ok: true, value: cleaned };
  } catch (error) {
    return { ok: false, error: describeStorageError(error) };
  }
}

export function deleteProject(id: string): StorageResult<void> {
  const store = storage();
  if (!store) return { ok: false, error: STORAGE_UNAVAILABLE };
  try {
    store.removeItem(keyOf(id));
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: STORAGE_UNAVAILABLE };
  }
}
