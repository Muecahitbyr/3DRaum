import { useCallback, useEffect, useState } from 'react';
import type { ProjectSession } from '../../hooks/useProjectSession';
import { readProjectFile } from '../../export/files';
import { cleanProjectName, DEFAULT_PROJECT_NAME, nextVariantName } from '../../projects/format';
import type { ProjectSummary } from '../../projects/storage';
import { ROOM_SHAPE_LABELS } from '../../config/room';
import type { RoomShape } from '../../types/room';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';
import { ProjectBar, type ProjectNotice, type ProjectStatus } from './ProjectBar';
import { ProjectsDialog } from './ProjectsDialog';
import { RecoveryDialog } from './RecoveryDialog';
import { SaveProjectDialog } from './SaveProjectDialog';

const NOTICE_DURATION_MS = 4000;

interface ProjectManagerProps {
  session: ProjectSession;
  /** Export-Dialog öffnen (liegt in der App, weil er Szene und Ansicht braucht). */
  onOpenExport: () => void;
  /** Der Plan wurde komplett ersetzt (Projekt geöffnet / neu) – z. B. Kamera neu einpassen. */
  onPlanReplaced: () => void;
  /** Ein Dialog ist offen – z. B. Tastenkürzel des Planers pausieren. */
  onModalChange: (open: boolean) => void;
}

/** Projektleiste und alle Projekt-Dialoge (Speichern, Übersicht, Bestätigungen). */
export function ProjectManager({ session, onPlanReplaced, onModalChange, onOpenExport }: ProjectManagerProps) {
  const [dialog, setDialog] = useState<'projects' | 'save' | 'save-as' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ProjectNotice | null>(null);

  const modalOpen = dialog !== null || confirm !== null || session.recoveryOffer !== null;
  useEffect(() => onModalChange(modalOpen), [modalOpen, onModalChange]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === 'error' ? NOTICE_DURATION_MS * 2 : NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const name = session.current?.name ?? DEFAULT_PROJECT_NAME;

  // Autosave: Hinweise zu unbrauchbaren Entwürfen (beim Start) und zu Schreibfehlern (einmalig).
  const { recoveryNotice, clearRecoveryNotice, autosaveError } = session;
  useEffect(() => {
    if (!recoveryNotice) return;
    setNotice({ kind: 'warning', text: recoveryNotice });
    clearRecoveryNotice();
  }, [recoveryNotice, clearRecoveryNotice]);
  useEffect(() => {
    if (autosaveError) {
      setNotice({ kind: 'error', text: `Automatische Sicherung nicht möglich: ${autosaveError} Zur Sicherheit über „Export“ eine Projektdatei speichern.` });
    }
  }, [autosaveError]);
  const status: ProjectStatus = session.dirty ? 'dirty' : session.current ? 'saved' : 'new';

  const refresh = useCallback(() => {
    const result = session.list();
    setProjects(result.ok ? result.value : []);
    setListError(result.ok ? null : result.error);
  }, [session]);

  const saveAs = useCallback(
    (newName?: string) => {
      const result = session.save(newName);
      const savedName = cleanProjectName(newName ?? session.current?.name);
      setNotice(result.ok ? { kind: 'success', text: `„${savedName}“ gespeichert.` } : { kind: 'error', text: result.error });
    },
    [session],
  );

  // Bestehendes Projekt direkt speichern, neues zuerst benennen.
  const handleSave = useCallback(() => {
    if (session.current) saveAs();
    else setDialog('save');
  }, [session, saveAs]);

  // Strg/⌘ + S speichert (statt „Seite speichern“ des Browsers), mit Umschalt: „Speichern unter“.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (modalOpen) return;
      if (event.shiftKey) setDialog('save-as');
      else handleSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, modalOpen]);

  /** Führt eine Aktion aus, die den Plan ersetzt – bei ungespeicherten Änderungen erst nach Rückfrage. */
  const guardUnsaved = (request: Omit<ConfirmRequest, 'onConfirm' | 'danger'>, action: () => void) => {
    if (session.dirty) setConfirm({ ...request, danger: true, onConfirm: action });
    else action();
  };

  const openProject = (project: ProjectSummary) =>
    guardUnsaved(
      {
        title: 'Ungespeicherte Änderungen verwerfen?',
        message: `„${name}“ hat ungespeicherte Änderungen. Beim Öffnen von „${project.name}“ gehen sie verloren.`,
        confirmLabel: 'Verwerfen und öffnen',
      },
      () => {
        const result = session.open(project.id);
        if (!result.ok) {
          setListError(`„${project.name}“ konnte nicht geöffnet werden: ${result.error}`);
          refresh();
          return;
        }
        setDialog(null);
        onPlanReplaced();
        setNotice(
          result.warnings.length
            ? { kind: 'warning', text: `„${project.name}“ geöffnet. ${result.warnings.join(' ')}` }
            : { kind: 'success', text: `„${project.name}“ geöffnet.` },
        );
      },
    );

  const startNewProject = (shape: RoomShape) =>
    guardUnsaved(
      {
        title: 'Neues Projekt beginnen?',
        message: `„${name}“ hat ungespeicherte Änderungen. Sie gehen verloren, wenn ein neues Projekt begonnen wird.`,
        confirmLabel: 'Verwerfen und neu beginnen',
      },
      () => {
        session.startNew(shape);
        setDialog(null);
        onPlanReplaced();
        setNotice({
          kind: 'success',
          text: shape === 'rectangle' ? 'Neues Projekt mit Standardraum gestartet.' : `Neues Projekt mit ${ROOM_SHAPE_LABELS[shape]} gestartet.`,
        });
      },
    );

  /** Datei erst vollständig prüfen – der aktuelle Plan bleibt bis dahin unangetastet. */
  const importFile = async (file: File) => {
    const parsed = await readProjectFile(file);
    if (!parsed.ok) {
      setListError(`„${file.name}“ kann nicht importiert werden: ${parsed.error}`);
      return;
    }
    guardUnsaved(
      {
        title: 'Ungespeicherte Änderungen verwerfen?',
        message: `„${name}“ hat ungespeicherte Änderungen. Beim Import von „${parsed.project.name}“ gehen sie verloren.`,
        confirmLabel: 'Verwerfen und importieren',
      },
      () => {
        const result = session.importProject(parsed.project);
        if (!result.ok) {
          setListError(result.error);
          return;
        }
        setDialog(null);
        onPlanReplaced();
        const warnings = [...parsed.warnings, ...result.warnings];
        setNotice(
          warnings.length
            ? { kind: 'warning', text: `„${parsed.project.name}“ importiert. ${warnings.join(' ')}` }
            : { kind: 'success', text: `„${parsed.project.name}“ importiert und gespeichert.` },
        );
      },
    );
  };

  const deleteProject = (project: ProjectSummary) =>
    setConfirm({
      title: 'Projekt löschen?',
      message: `„${project.name}“ wird dauerhaft aus diesem Browser gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
      onConfirm: () => {
        const result = session.remove(project.id);
        if (!result.ok) setListError(result.error);
        refresh();
      },
    });

  const renameProject = (project: ProjectSummary, newName: string) => {
    const result = session.rename(project.id, newName);
    if (!result.ok) {
      setListError(result.error);
      return false;
    }
    refresh();
    return true;
  };

  return (
    <>
      <ProjectBar
        name={name}
        status={status}
        savedAt={session.savedAt}
        notice={notice}
        onSave={handleSave}
        onOpenProjects={() => {
          refresh();
          setDialog('projects');
        }}
        onOpenExport={onOpenExport}
      />
      {dialog === 'projects' && (
        <ProjectsDialog
          projects={projects}
          currentId={session.current?.id ?? null}
          error={listError}
          onOpen={openProject}
          onRename={renameProject}
          onDelete={deleteProject}
          onNew={startNewProject}
          onImport={(file) => void importFile(file)}
          onSaveAs={() => setDialog('save-as')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'save-as' && (
        <SaveProjectDialog
          saveAs
          initialName={nextVariantName(name)}
          onSave={(newName) => {
            setDialog(null);
            const result = session.saveAs(newName);
            setNotice(
              result.ok
                ? { kind: 'success', text: `Als „${cleanProjectName(newName)}“ gespeichert – das bisherige Projekt bleibt unverändert.` }
                : { kind: 'error', text: result.error },
            );
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {session.recoveryOffer && (
        <RecoveryDialog
          offer={session.recoveryOffer}
          onRestore={() => {
            session.restoreRecovery();
            onPlanReplaced();
            setNotice({ kind: 'warning', text: 'Änderungen wiederhergestellt – noch nicht gespeichert.' });
          }}
          onDiscard={() => {
            const result = session.discardRecovery();
            onPlanReplaced();
            setNotice(result.ok ? { kind: 'success', text: 'Nicht gespeicherte Änderungen verworfen.' } : { kind: 'error', text: result.error });
          }}
        />
      )}
      {dialog === 'save' && (
        <SaveProjectDialog
          initialName=""
          onSave={(newName) => {
            setDialog(null);
            saveAs(newName);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
