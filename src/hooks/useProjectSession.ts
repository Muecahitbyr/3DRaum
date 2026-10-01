import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PLAN, DEFAULT_PROJECT_NAME, type ProjectFile } from '../projects/format';
import {
  clearRecovery,
  createRecoveryDraft,
  hasRecovery,
  readRecovery,
  recoveryIsRelevant,
  writeRecovery,
  type RecoveryDraft,
} from '../projects/recovery';
import { deleteProject, listProjects, loadProject, renameProject, saveProject } from '../projects/storage';
import { sameDocument, type PlanDocument } from '../state/history';
import type { RoomShape } from '../types/room';
import { createRoomForShape } from '../utils/room/plan';

export interface CurrentProject {
  id: string;
  name: string;
  /** Zeitpunkt der letzten Speicherung (für den Wiederherstellungsentwurf). */
  updatedAt: string;
}

export type ProjectResult = { ok: true; warnings: string[] } | { ok: false; error: string };

/** Ruhezeit nach der letzten Änderung, bevor der Entwurf geschrieben wird. */
export const AUTOSAVE_DELAY_MS = 800;

/** Angebot beim Start: Entwurf, der neuer ist als der gespeicherte Stand. */
export interface RecoveryOffer {
  name: string;
  savedAt: string;
}

interface StartupRecovery {
  /** Entwurf, über den noch entschieden werden muss (`null` = keiner). */
  draft: RecoveryDraft | null;
  /** Gespeichertes Basisprojekt des Entwurfs (falls noch vorhanden). */
  base: ProjectFile | null;
  /** Hinweis, z. B. zu einem beschädigten Entwurf. */
  notice: string | null;
}

/** Beim Start: Entwurf lesen und entscheiden, ob er angeboten wird (unbrauchbare entfernen). */
function checkRecovery(): StartupRecovery {
  const parsed = readRecovery();
  if (!parsed.ok) {
    if (parsed.reason === 'empty') return { draft: null, base: null, notice: null };
    clearRecovery();
    return {
      draft: null,
      base: null,
      notice:
        parsed.reason === 'future'
          ? 'Ein Wiederherstellungsentwurf aus einer neueren Version konnte nicht geladen werden und wurde entfernt.'
          : 'Ein beschädigter Wiederherstellungsentwurf wurde entfernt.',
    };
  }
  const { draft } = parsed;
  const loaded = draft.base ? loadProject(draft.base.id) : null;
  const base = loaded?.ok ? loaded.project : null;
  if (!recoveryIsRelevant(draft, base)) {
    clearRecovery();
    return { draft: null, base: null, notice: null };
  }
  return { draft, base, notice: null };
}

/**
 * Lokale Projekte: welches Projekt offen ist, welcher Stand zuletzt gespeichert
 * wurde (für „ungespeicherte Änderungen“) und die Aktionen dazu. Der Plan selbst
 * lebt weiter im Planungszustand; `load` ersetzt ihn samt Verlauf.
 *
 * Zusätzlich Autosave: Solange der Plan ungespeicherte Änderungen hat, wird ein separater
 * Wiederherstellungsentwurf gesichert (gedrosselt, nie während einer Geste). Beim Start wird
 * ein neuerer Entwurf angeboten – nie ungefragt geladen.
 *
 * @param busy  Läuft gerade eine Geste (Ziehen, Drehen)? Dann wird nicht gesichert.
 */
export function useProjectSession(document: PlanDocument, load: (plan: PlanDocument) => void, busy = false) {
  const [current, setCurrent] = useState<CurrentProject | null>(null);
  const [savedPlan, setSavedPlan] = useState<PlanDocument>(DEFAULT_PLAN);
  /** Zeitpunkt des letzten erfolgreichen Speicherns in dieser Sitzung (für die Rückmeldung). */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [startup] = useState(checkRecovery);
  const [pending, setPending] = useState<RecoveryDraft | null>(startup.draft);
  /** Schreibfehler des Autosave: bis zum nächsten erfolgreichen Speichern keine weiteren Versuche. */
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(startup.notice);

  // Wertvergleich: Wer eine Änderung rückgängig macht, ist wieder „gespeichert“.
  const dirty = !sameDocument(savedPlan, document);

  // Beim Schließen/Neuladen des Tabs warnen, solange Änderungen offen sind.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Autosave: erst nach der Entscheidung über einen alten Entwurf, nie während einer Geste und
  // erst nach einer Ruhezeit – beim Ziehen entsteht so kein Schreibvorgang je Zeigerbewegung.
  // Der Effekt läuft bei jeder Planänderung neu und startet die Ruhezeit damit von vorn.
  useEffect(() => {
    if (pending || busy || autosaveError) return;
    if (!dirty) {
      if (hasRecovery()) clearRecovery();
      return;
    }
    const timer = setTimeout(() => {
      const draft = createRecoveryDraft(document, current?.name ?? DEFAULT_PROJECT_NAME, current ? { id: current.id, updatedAt: current.updatedAt } : null);
      const result = writeRecovery(draft);
      if (!result.ok) setAutosaveError(result.error);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [document, current, dirty, busy, pending, autosaveError]);

  const markSaved = useCallback((project: ProjectFile, plan: PlanDocument) => {
    setCurrent({ id: project.id, name: project.name, updatedAt: project.updatedAt });
    setSavedPlan(plan);
    setSavedAt(Date.now());
    setAutosaveError(null);
    clearRecovery();
  }, []);

  const save = useCallback(
    (name?: string): ProjectResult => {
      const result = saveProject({ id: current?.id, name: name ?? current?.name ?? DEFAULT_PROJECT_NAME, plan: document });
      if (!result.ok) return result;
      markSaved(result.value, document);
      return { ok: true, warnings: [] };
    },
    [current, document, markSaved],
  );

  /**
   * „Speichern unter“: aktueller Stand als NEUES Projekt (neue ID, eigene Zeitstempel). Das
   * bisherige Projekt bleibt unverändert; danach wird im neuen Projekt weitergearbeitet. Der
   * Verlauf bleibt erhalten (wie in anderen Programmen), der Entwurf zeigt auf das neue Projekt.
   */
  const saveAs = useCallback(
    (name: string): ProjectResult => {
      const result = saveProject({ name, plan: document });
      if (!result.ok) return result;
      markSaved(result.value, document);
      return { ok: true, warnings: [] };
    },
    [document, markSaved],
  );

  const open = useCallback(
    (id: string): ProjectResult => {
      const result = loadProject(id);
      if (!result.ok) return result;
      load(result.project.plan);
      setCurrent({ id: result.project.id, name: result.project.name, updatedAt: result.project.updatedAt });
      setSavedPlan(result.project.plan);
      setSavedAt(null);
      return { ok: true, warnings: result.warnings };
    },
    [load],
  );

  /** Neues Projekt; Rechteck = Standardraum, sonst Vorlage der gewählten Raumform. */
  const startNew = useCallback(
    (shape: RoomShape = 'rectangle') => {
      const plan: PlanDocument =
        shape === 'rectangle'
          ? DEFAULT_PLAN
          : (() => {
              const room = createRoomForShape(shape, DEFAULT_PLAN.room.height);
              const color = DEFAULT_PLAN.design.wallColors.north;
              return { ...DEFAULT_PLAN, room, design: { ...DEFAULT_PLAN.design, wallColors: Object.fromEntries(room.walls.map((w) => [w.id, color])) } };
            })();
      load(plan);
      setCurrent(null);
      setSavedPlan(plan);
      setSavedAt(null);
    },
    [load],
  );

  /**
   * Geprüftes Projekt aus einer Datei übernehmen: als NEUES lokales Projekt speichern
   * (nie ein bestehendes überschreiben) und öffnen. Ist der lokale Speicher voll,
   * wird es trotzdem geöffnet – dann als ungespeichertes Projekt.
   */
  const importProject = useCallback(
    (project: ProjectFile): ProjectResult => {
      const saved = saveProject({ name: project.name, plan: project.plan });
      load(project.plan);
      setSavedAt(null);
      if (!saved.ok) {
        setCurrent(null);
        setSavedPlan(DEFAULT_PLAN);
        return { ok: true, warnings: [`Nicht lokal gespeichert: ${saved.error}`] };
      }
      setCurrent({ id: saved.value.id, name: saved.value.name, updatedAt: saved.value.updatedAt });
      setSavedPlan(project.plan);
      return { ok: true, warnings: [] };
    },
    [load],
  );

  const rename = useCallback(
    (id: string, name: string): ProjectResult => {
      const result = renameProject(id, name);
      if (!result.ok) return result;
      if (current?.id === id) setCurrent({ ...current, name: result.value });
      return { ok: true, warnings: [] };
    },
    [current],
  );

  const remove = useCallback(
    (id: string): ProjectResult => {
      const result = deleteProject(id);
      if (!result.ok) return result;
      // Das offene Projekt wurde gelöscht: Plan bleibt im Editor, gilt aber als ungespeichert.
      if (current?.id === id) {
        setCurrent(null);
        setSavedPlan(DEFAULT_PLAN);
        setSavedAt(null);
      }
      return { ok: true, warnings: [] };
    },
    [current],
  );

  /**
   * Entwurf wiederherstellen: exakt dessen Plan laden; das Projekt bleibt „ungespeichert“
   * (Vergleich mit dem gespeicherten Basisprojekt bzw. einem neuen Projekt).
   */
  const restoreRecovery = useCallback(() => {
    if (!pending) return;
    const loaded = pending.base ? loadProject(pending.base.id) : null;
    load(pending.project.plan);
    if (loaded?.ok) {
      setCurrent({ id: loaded.project.id, name: loaded.project.name, updatedAt: loaded.project.updatedAt });
      setSavedPlan(loaded.project.plan);
    } else {
      setCurrent(null);
      setSavedPlan(DEFAULT_PLAN);
    }
    setSavedAt(null);
    setPending(null);
  }, [pending, load]);

  /** Entwurf verwerfen: entfernen und – falls vorhanden – den gespeicherten Stand öffnen. */
  const discardRecovery = useCallback((): ProjectResult => {
    const base = pending?.base;
    clearRecovery();
    setPending(null);
    return base && startup.base ? open(base.id) : { ok: true, warnings: [] };
  }, [pending, startup.base, open]);

  const recoveryOffer: RecoveryOffer | null = pending
    ? { name: startup.base?.name ?? pending.project.name, savedAt: pending.savedAt }
    : null;

  return {
    current,
    dirty,
    savedAt,
    save,
    saveAs,
    open,
    startNew,
    importProject,
    rename,
    remove,
    list: listProjects,
    recoveryOffer,
    restoreRecovery,
    discardRecovery,
    autosaveError,
    recoveryNotice,
    clearRecoveryNotice: useCallback(() => setRecoveryNotice(null), []),
  };
}

export type ProjectSession = ReturnType<typeof useProjectSession>;
