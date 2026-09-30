import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PLAN, DEFAULT_PROJECT_NAME, type ProjectFile } from '../projects/format';
import { deleteProject, listProjects, loadProject, renameProject, saveProject } from '../projects/storage';
import { sameDocument, type PlanDocument } from '../state/history';
import type { RoomShape } from '../types/room';
import { createRoomForShape } from '../utils/room/plan';

export interface CurrentProject {
  id: string;
  name: string;
}

export type ProjectResult = { ok: true; warnings: string[] } | { ok: false; error: string };

/**
 * Lokale Projekte: welches Projekt offen ist, welcher Stand zuletzt gespeichert
 * wurde (für „ungespeicherte Änderungen“) und die Aktionen dazu. Der Plan selbst
 * lebt weiter im Planungszustand; `load` ersetzt ihn samt Verlauf.
 */
export function useProjectSession(document: PlanDocument, load: (plan: PlanDocument) => void) {
  const [current, setCurrent] = useState<CurrentProject | null>(null);
  const [savedPlan, setSavedPlan] = useState<PlanDocument>(DEFAULT_PLAN);
  /** Zeitpunkt des letzten erfolgreichen Speicherns in dieser Sitzung (für die Rückmeldung). */
  const [savedAt, setSavedAt] = useState<number | null>(null);

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

  const save = useCallback(
    (name?: string): ProjectResult => {
      const result = saveProject({ id: current?.id, name: name ?? current?.name ?? DEFAULT_PROJECT_NAME, plan: document });
      if (!result.ok) return result;
      setCurrent({ id: result.value.id, name: result.value.name });
      setSavedPlan(document);
      setSavedAt(Date.now());
      return { ok: true, warnings: [] };
    },
    [current, document],
  );

  const open = useCallback(
    (id: string): ProjectResult => {
      const result = loadProject(id);
      if (!result.ok) return result;
      load(result.project.plan);
      setCurrent({ id: result.project.id, name: result.project.name });
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
      setCurrent({ id: saved.value.id, name: saved.value.name });
      setSavedPlan(project.plan);
      return { ok: true, warnings: [] };
    },
    [load],
  );

  const rename = useCallback(
    (id: string, name: string): ProjectResult => {
      const result = renameProject(id, name);
      if (!result.ok) return result;
      if (current?.id === id) setCurrent({ id, name: result.value });
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

  return { current, dirty, savedAt, save, open, startNew, importProject, rename, remove, list: listProjects };
}

export type ProjectSession = ReturnType<typeof useProjectSession>;
